import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import {
  consentRecords,
  signatures,
  signers,
  versions,
} from "@/lib/db/schema";
// `main` moved this out of the server action and into its own module; the
// action now imports it from here too.
import { recordSignature } from "@/server/signatures/record";
import { resolveSignatureStatus } from "@/lib/db/signature-status";
import { reaffirmSignature } from "@/lib/db/reaffirm";

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
    expect(status.firstVersion).toBe("0.0.1");
    expect(Number.isNaN(Date.parse(status.firstSignedAt))).toBe(false);
  });

  it("pairs firstSignedAt with the version actually signed on that date", async () => {
    // The bug this guards: rendering "signing since <first date> (<latest
    // version>)" states a date the person did not sign that version on.
    const db = await createTestDb();
    await syncVersions(db, [
      {
        version: "0.0.1",
        publishedAt: new Date("2026-01-01T00:00:00Z"),
        markdown: markdownFor("0.0.1"),
        agentsMd: "stub",
        specJson: "{}",
        isCurrent: false,
        gitCommitSha: null,
      },
      {
        version: "0.0.2",
        publishedAt: new Date("2026-05-01T00:00:00Z"),
        markdown: markdownFor("0.0.2"),
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
    const signer = await seedSigner(db, "u-two");
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "0.0.1",
      consentTextHash: "1".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "0.0.2",
      consentTextHash: "2".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });

    const status = await resolveSignatureStatus(db, signer, "0.1.0");

    if (status.state !== "signed-earlier") throw new Error("unreachable");
    // Latest pair travels together...
    expect(status.version).toBe("0.0.2");
    // ...and so does the first pair. Swapping latest/earliest must fail here.
    expect(status.firstVersion).toBe("0.0.1");
    expect(Date.parse(status.firstSignedAt)).toBeLessThan(
      Date.parse(status.signedAt),
    );
  });

  it("reports signed-other when the requested version is superseded", async () => {
    // Viewing an archive page after signing the current version. There is
    // nothing to re-affirm, and "what's been added since you signed" would be
    // backwards.
    const db = await createTestDb();
    await seedVersions(db);
    const signer = await seedSigner(db, "u-archive");
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "0.1.0",
      consentTextHash: "3".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });

    const status = await resolveSignatureStatus(db, signer, "0.0.1");

    expect(status.state).toBe("signed-other");
    if (status.state !== "signed-other") throw new Error("unreachable");
    expect(status.version).toBe("0.1.0");
    expect(status.requestedVersion).toBe("0.0.1");
  });

  it("does not claim a version is closed when it simply has no row yet", async () => {
    // sync-versions is a MANUAL post-deploy step and SignModal hardcodes the
    // version constant, so a deploy can be ahead of the database — as can the
    // window during the unsync/re-sync remedy. Reporting signed-other there
    // renders "v0.1.0 is no longer open for signing" about the very version the
    // site is campaigning for: false, and with no sign path offered.
    const db = await createTestDb();
    await syncVersions(db, [
      {
        version: "0.0.1",
        publishedAt: new Date("2026-05-18T00:00:00Z"),
        markdown: markdownFor("0.0.1"),
        agentsMd: "stub",
        specJson: "{}",
        isCurrent: true,
        gitCommitSha: null,
      },
    ]);
    const signer = await seedSigner(db, "u-ahead");
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "0.0.1",
      consentTextHash: "7".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });

    // 0.1.0 has no row at all.
    const status = await resolveSignatureStatus(db, signer, "0.1.0");

    expect(status.state).toBe("signed-version-unknown");
    if (status.state !== "signed-version-unknown") {
      throw new Error("unreachable");
    }
    // Their own signature is still reported accurately.
    expect(status.version).toBe("0.0.1");
    expect(status.requestedVersion).toBe("0.1.0");
    expect(status.displayName).toBe("Signer u-ahead");
  });

  it("reports signed-other for an archived version NEWER than the one signed", async () => {
    // The gap between the two guards: 0.0.2 is newer than the signed 0.0.1 but
    // is archived, so reaffirmSignature would refuse it. Returning
    // signed-earlier here renders an "Add my name to v0.0.2" button that can
    // only ever fail.
    const db = await createTestDb();
    await syncVersions(db, [
      {
        version: "0.0.1",
        publishedAt: new Date("2026-01-01T00:00:00Z"),
        markdown: markdownFor("0.0.1"),
        agentsMd: "stub",
        specJson: "{}",
        isCurrent: false,
        gitCommitSha: null,
      },
      {
        version: "0.0.2",
        publishedAt: new Date("2026-05-01T00:00:00Z"),
        markdown: markdownFor("0.0.2"),
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
    const signer = await seedSigner(db, "u-gap");
    await recordSignature(db, {
      signerId: signer.id,
      versionString: "0.0.1",
      consentTextHash: "9".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });

    expect((await resolveSignatureStatus(db, signer, "0.0.2")).state).toBe(
      "signed-other",
    );
    // ...while the CURRENT version still offers the re-affirm.
    expect((await resolveSignatureStatus(db, signer, "0.1.0")).state).toBe(
      "signed-earlier",
    );
  });
});

/**
 * A signer who has already signed something — the precondition for
 * re-affirming. Defaults to v0.0.1, the ordinary "signed before the new version
 * was published" case.
 */
async function seedPriorSigner(
  db: TestDb,
  clerkUserId: string,
  versionString = "0.0.1",
) {
  const signer = await seedSigner(db, clerkUserId);
  await recordSignature(db, {
    signerId: signer.id,
    versionString,
    consentTextHash: "a".repeat(64),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    capturedFields: {} as any,
  });
  return signer;
}

describe("reaffirmSignature", () => {
  it("refuses a signer who has never signed anything", async () => {
    // Comment-only accounts get a signers row with zero signatures. Without
    // this guard an authenticated commenter calling the action directly would
    // become a public signatory, skipping the consent page entirely.
    const db = await createTestDb();
    await seedVersions(db);
    const commenter = await seedSigner(db, "u-comment-only");

    const res = await reaffirmSignature(db, {
      signerId: commenter.id,
      versionString: "0.1.0",
      consentTextHash: "c".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });

    expect(res.ok).toBe(false);
    expect(
      await db
        .select()
        .from(signatures)
        .where(eq(signatures.signerId, commenter.id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(consentRecords)
        .where(eq(consentRecords.signerId, commenter.id)),
    ).toHaveLength(0);
  });

  it("deletes the consent record it wrote when the signature insert fails", async () => {
    // The consent row is written first and neon-http has no transactions, so
    // an error after it leaves an orphan unless we clean up by hand. Simulates
    // the documented race: a conflicting signature appears between the
    // already-signed read and the insert.
    const db = await createTestDb();
    await seedVersions(db);
    const signer = await seedPriorSigner(db, "u-race");
    const [target] = await db
      .select()
      .from(versions)
      .where(eq(versions.version, "0.1.0"))
      .limit(1);

    let injected = false;
    const racingDb = {
      ...db,
      select: db.select.bind(db),
      delete: db.delete.bind(db),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      insert(table: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const builder: any = (db as any).insert(table);
        if (table === consentRecords && !injected) {
          const origValues = builder.values.bind(builder);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          builder.values = (...vargs: any[]) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const vb: any = origValues(...vargs);
            const origReturning = vb.returning.bind(vb);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            vb.returning = async (...rargs: any[]) => {
              const rows = await origReturning(...rargs);
              injected = true;
              // The racing writer wins, with its OWN consent record — so the
              // one this call just wrote is referenced by nothing and must be
              // cleaned up, which is the whole point of the test.
              const [racerConsent] = await db
                .insert(consentRecords)
                .values({
                  signerId: signer.id,
                  consentTextHash: "e".repeat(64),
                  capturedFields: {},
                })
                .returning({ id: consentRecords.id });
              await db.insert(signatures).values({
                signerId: signer.id,
                versionId: target.id,
                versionHashAtSigning: target.markdownHash,
                consentRecordId: racerConsent.id,
              });
              return rows;
            };
            return vb;
          };
        }
        return builder;
      },
    } as unknown as Parameters<typeof reaffirmSignature>[0];

    const consentBefore = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.signerId, signer.id));

    const res = await reaffirmSignature(racingDb, {
      signerId: signer.id,
      versionString: "0.1.0",
      consentTextHash: "d".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });

    // The row the racer created is the end state the caller wanted.
    expect(res).toEqual({ ok: true, created: false });
    const sigs = await db
      .select()
      .from(signatures)
      .where(eq(signatures.signerId, signer.id));
    expect(sigs).toHaveLength(2); // 0.0.1 + the raced 0.1.0

    // Exactly ONE consent record was added — the racer's, which its signature
    // references. The one reaffirmSignature wrote before losing the race is
    // referenced by nothing and must have been deleted. +2 here means the leak
    // simply moved from the repeat path to the error path.
    const consentAfter = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.signerId, signer.id));
    expect(consentAfter.length).toBe(consentBefore.length + 1);
  });

  it("deletes the consent record AND rethrows on a non-duplicate failure", async () => {
    // The catch was widened from the duplicate-key branch to every error path.
    // Without this case, moving the delete back inside `if (/duplicate key/)`
    // would still pass every other test — the race test only drives the
    // duplicate path. Two things must hold here: the orphan is cleaned up, and
    // the error is NOT swallowed into a success.
    const db = await createTestDb();
    await seedVersions(db);
    const signer = await seedPriorSigner(db, "u-boom");

    const failingDb = {
      ...db,
      select: db.select.bind(db),
      delete: db.delete.bind(db),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      insert(table: any) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const builder: any = (db as any).insert(table);
        if (table === signatures) {
          builder.values = () =>
            Promise.reject(new Error("connection reset by peer"));
        }
        return builder;
      },
    } as unknown as Parameters<typeof reaffirmSignature>[0];

    const consentBefore = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.signerId, signer.id));

    await expect(
      reaffirmSignature(failingDb, {
        signerId: signer.id,
        versionString: "0.1.0",
        consentTextHash: "b".repeat(64),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        capturedFields: {} as any,
      }),
    ).rejects.toThrow(/connection reset/);

    // No orphan left behind, and no signature written.
    const consentAfter = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.signerId, signer.id));
    expect(consentAfter).toHaveLength(consentBefore.length);
    expect(
      await db
        .select()
        .from(signatures)
        .where(eq(signatures.signerId, signer.id)),
    ).toHaveLength(1); // just the 0.0.1 they arrived with
  });

  it("adds a signature on the current version without touching the earlier one", async () => {
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
    expect((await resolveSignatureStatus(db, signer, "0.1.0")).state).toBe(
      "signed-earlier",
    );

    const res = await reaffirmSignature(db, {
      signerId: signer.id,
      versionString: "0.1.0",
      consentTextHash: "0".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });

    expect(res).toEqual({ ok: true, created: true });
    const rows = await db
      .select()
      .from(signatures)
      .where(eq(signatures.signerId, signer.id));
    expect(rows).toHaveLength(2);
    // Both versions now read as signed — the old signature is intact.
    expect((await resolveSignatureStatus(db, signer, "0.1.0")).state).toBe(
      "signed",
    );
    expect((await resolveSignatureStatus(db, signer, "0.0.1")).state).toBe(
      "signed",
    );
  });

  it("stamps the signature with the affirmed version's markdown hash", async () => {
    // This, not the consent hash, is what binds the signature to the new text.
    const db = await createTestDb();
    await seedVersions(db);
    const signer = await seedPriorSigner(db, "u-hash");

    await reaffirmSignature(db, {
      signerId: signer.id,
      versionString: "0.1.0",
      consentTextHash: "4".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });

    const [version] = await db
      .select()
      .from(versions)
      .where(eq(versions.version, "0.1.0"))
      .limit(1);
    // Scoped to the 0.1.0 row specifically: the signer also owns a 0.0.1
    // signature, and selecting by signer alone would assert against whichever
    // row came back first.
    const [sig] = await db
      .select()
      .from(signatures)
      .where(
        and(
          eq(signatures.signerId, signer.id),
          eq(signatures.versionId, version.id),
        ),
      );
    expect(sig.versionHashAtSigning).toBe(version.markdownHash);
    // ...and it is genuinely the NEW text's hash, not the one they signed before.
    const [old] = await db
      .select()
      .from(versions)
      .where(eq(versions.version, "0.0.1"))
      .limit(1);
    expect(sig.versionHashAtSigning).not.toBe(old.markdownHash);
  });

  it("is a genuine no-op on a repeat, leaving no orphan consent record", async () => {
    // recordSignature inserts consent BEFORE the signature, so detecting a
    // repeat via the unique-constraint violation would leak a consent_records
    // row on every call — and consent_records has no unique constraint, so a
    // loop would write unbounded rows.
    const db = await createTestDb();
    await seedVersions(db);
    const signer = await seedPriorSigner(db, "u-repeat");

    const first = await reaffirmSignature(db, {
      signerId: signer.id,
      versionString: "0.1.0",
      consentTextHash: "5".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });
    const consentAfterFirst = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.signerId, signer.id));

    for (let i = 0; i < 3; i++) {
      const repeat = await reaffirmSignature(db, {
        signerId: signer.id,
        versionString: "0.1.0",
        consentTextHash: "6".repeat(64),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        capturedFields: {} as any,
      });
      expect(repeat).toEqual({ ok: true, created: false });
    }

    expect(first).toEqual({ ok: true, created: true });
    const consentAfterRepeats = await db
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.signerId, signer.id));
    expect(consentAfterRepeats).toHaveLength(consentAfterFirst.length);
    // Two signatures total and no more: the 0.0.1 they arrived with, plus the
    // single 0.1.0 the first call created. Three repeats added nothing.
    const sigs = await db
      .select()
      .from(signatures)
      .where(eq(signatures.signerId, signer.id));
    expect(sigs).toHaveLength(2);
  });

  it("refuses a version that is not current, and writes nothing", async () => {
    // The client supplies the version string, so this is reachable by any
    // authenticated user. Attaching signatures to archived versions is not
    // something any surface offers.
    const db = await createTestDb();
    await seedVersions(db);
    // Signed the CURRENT version, then asks to affirm the archived one. Seeded
    // this way round on purpose: if the guard were removed, the already-signed
    // short-circuit would not catch it and a real row would be written against
    // 0.0.1 — so the write assertions below are load-bearing, not decorative.
    const signer = await seedPriorSigner(db, "u-archived", "0.1.0");

    const res = await reaffirmSignature(db, {
      signerId: signer.id,
      versionString: "0.0.1",
      consentTextHash: "7".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });

    expect(res.ok).toBe(false);
    // The one signature + consent record they arrived with, and nothing added.
    expect(
      await db
        .select()
        .from(signatures)
        .where(eq(signatures.signerId, signer.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(consentRecords)
        .where(eq(consentRecords.signerId, signer.id)),
    ).toHaveLength(1);
  });

  it("refuses an unknown version", async () => {
    const db = await createTestDb();
    await seedVersions(db);
    const signer = await seedPriorSigner(db, "u-unknown");

    const res = await reaffirmSignature(db, {
      signerId: signer.id,
      versionString: "9.9.9",
      consentTextHash: "8".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
    });

    expect(res.ok).toBe(false);
  });
});
