import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { signers } from "@/lib/db/schema";
import { recordSignature } from "@/server/actions/sign";
import { resolveSignatureStatus } from "@/lib/db/signature-status";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

function markdownFor(version: string): string {
  return `---
version: ${version}
published_at: 2026-05-18
---

# T {#preamble}
x {#preamble-s-1}
`;
}

/**
 * Seed two versions with 0.1.0 current, mirroring the 0.0.1 -> 0.1.0 publish.
 */
async function seedVersions(db: TestDb) {
  await syncVersions(db, [
    {
      version: "0.0.1",
      publishedAt: new Date("2026-05-18T00:00:00Z"),
      markdown: markdownFor("0.0.1"),
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: false,
      gitCommitSha: null,
    },
    {
      version: "0.1.0",
      publishedAt: new Date("2026-07-24T00:00:00Z"),
      markdown: markdownFor("0.1.0"),
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: true,
      gitCommitSha: null,
    },
  ]);
}

async function seedSigner(db: TestDb, clerkUserId: string) {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId,
      displayName: `Signer ${clerkUserId}`,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning();
  return row;
}

describe("resolveSignatureStatus", () => {
  it("reports someone who signed only v0.0.1 as signed-earlier, not not-signed", async () => {
    const db = await createTestDb();
    await seedVersions(db);
    const signer = await seedSigner(db, "u-early");
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "0.0.1",
      consentTextHash: "a".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });

    const status = await resolveSignatureStatus(db, signer, "0.1.0");

    // The regression this guards: treating a prior signer as a stranger and
    // handing them a blank sign form on the new version.
    expect(status.state).toBe("signed-earlier");
    if (status.state !== "signed-earlier") throw new Error("unreachable");
    expect(status.version).toBe("0.0.1");
    expect(status.requestedVersion).toBe("0.1.0");
    expect(status.displayName).toBe("Signer u-early");
  });

  it("reports someone who signed the requested version as signed", async () => {
    const db = await createTestDb();
    await seedVersions(db);
    const signer = await seedSigner(db, "u-current");
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "0.1.0",
      consentTextHash: "b".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });

    const status = await resolveSignatureStatus(db, signer, "0.1.0");

    expect(status.state).toBe("signed");
    if (status.state !== "signed") throw new Error("unreachable");
    expect(status.version).toBe("0.1.0");
  });

  it("prefers the exact version match over a more recent signature on another version", async () => {
    const db = await createTestDb();
    await seedVersions(db);
    const signer = await seedSigner(db, "u-both");
    // Signed 0.1.0 first, then 0.0.1 later (an archive-page signature). The
    // most recent row is 0.0.1, but the question asked was about 0.1.0.
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "0.1.0",
      consentTextHash: "c".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "0.0.1",
      consentTextHash: "d".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });

    const status = await resolveSignatureStatus(db, signer, "0.1.0");

    expect(status.state).toBe("signed");
  });

  it("reports not-signed only when the person has no signature at all", async () => {
    const db = await createTestDb();
    await seedVersions(db);
    const signer = await seedSigner(db, "u-none");

    const status = await resolveSignatureStatus(db, signer, "0.1.0");

    expect(status.state).toBe("not-signed");
  });

  it("carries first-signed date forward so 'signing since' predates the new version", async () => {
    const db = await createTestDb();
    await seedVersions(db);
    const signer = await seedSigner(db, "u-since");
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "0.0.1",
      consentTextHash: "e".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });

    const status = await resolveSignatureStatus(db, signer, "0.1.0");

    if (status.state !== "signed-earlier") throw new Error("unreachable");
    // Only one signature, so first and latest coincide — the point is that the
    // field is populated rather than left undefined for the "signing since" copy.
    expect(status.firstSignedAt).toBe(status.signedAt);
    expect(Number.isNaN(Date.parse(status.firstSignedAt))).toBe(false);
  });

  it("does not delete or hide the earlier signature when the person re-affirms", async () => {
    const db = await createTestDb();
    await seedVersions(db);
    const signer = await seedSigner(db, "u-reaffirm");
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "0.0.1",
      consentTextHash: "f".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });
    // The re-affirm path adds a row; it never touches the old one.
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "0.1.0",
      consentTextHash: "0".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });

    const { signatures } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const rows = await db
      .select()
      .from(signatures)
      .where(eq(signatures.signerId, signer.id));

    expect(rows).toHaveLength(2);
    expect((await resolveSignatureStatus(db, signer, "0.1.0")).state).toBe(
      "signed",
    );
    expect((await resolveSignatureStatus(db, signer, "0.0.1")).state).toBe(
      "signed",
    );
  });
});
