/**
 * /admin/referrals: the admin gate, and the numbers behind it on a real
 * (pglite) database.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
import { signatures, signers, versions, consentRecords } from "@/lib/db/schema";
import {
  REFERRAL_TRACKING_START,
  getReferralTotals,
  listReferrers,
} from "@/lib/db/referrals";

const state = vi.hoisted(() => ({
  db: null as unknown,
  admin: { state: "unauthenticated" } as Record<string, unknown>,
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => React.createElement("a", { href, ...rest }, children),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/admin/check", () => ({
  getCurrentAdmin: async () => state.admin,
}));
vi.mock("@/lib/db/lazy", () => ({ getDb: () => state.db }));

import AdminReferralsPage from "@/app/admin/referrals/page";

const ADMIN = {
  state: "admin",
  signer: {
    id: "00000000-0000-4000-8000-000000000001",
    clerkUserId: "user_admin",
    displayName: "Admin",
    isAdmin: true,
  },
};

const AFTER = new Date(REFERRAL_TRACKING_START.getTime() + 86_400_000);
const BEFORE = new Date(REFERRAL_TRACKING_START.getTime() - 86_400_000);

let db: TestDb;
let versionId: string;

beforeEach(async () => {
  db = await createTestDb();
  state.db = db;
  state.admin = { state: "unauthenticated" };
  const [v] = await db
    .insert(versions)
    .values({
      version: "1.0.0",
      publishedAt: new Date(),
      markdownHash: "a".repeat(64),
      agentsMdHash: "b".repeat(64),
      specJsonHash: "c".repeat(64),
      parsedJson: {},
      isCurrent: true,
    })
    .returning({ id: versions.id });
  versionId = v.id as string;
});

async function seed(
  displayName: string,
  opts: {
    referredBy?: string;
    signedAt?: Date | null;
    createdAt?: Date;
  } = {},
): Promise<string> {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId: `user_${displayName}`,
      displayName,
      verificationMethod: "email",
      verifiedAt: new Date(),
      referredBySignerId: opts.referredBy ?? null,
      createdAt: opts.createdAt ?? AFTER,
    })
    .returning({ id: signers.id });
  const id = row.id as string;
  if (opts.signedAt !== null) {
    const [c] = await db
      .insert(consentRecords)
      .values({ signerId: id, consentTextHash: "h" })
      .returning({ id: consentRecords.id });
    await db.insert(signatures).values({
      signerId: id,
      versionId,
      versionHashAtSigning: "h",
      consentRecordId: c.id,
      signedAt: opts.signedAt ?? AFTER,
    });
  }
  return id;
}

describe("/admin/referrals gate", () => {
  for (const admin of [
    { state: "unauthenticated" },
    { state: "not-a-signer", clerkUserId: "user_x" },
    { state: "not-admin", signer: { ...ADMIN.signer, isAdmin: false } },
  ]) {
    it(`calls notFound for ${admin.state}`, async () => {
      state.admin = admin;
      await expect(AdminReferralsPage()).rejects.toThrow("NEXT_NOT_FOUND");
    });
  }

  it("renders for an admin, with the tracking note and the denominator", async () => {
    state.admin = ADMIN;
    const a = await seed("Alice");
    await seed("Bob", { referredBy: a });
    await seed("Organic");

    const html = renderToStaticMarkup(
      (await AdminReferralsPage()) as React.ReactElement,
    );
    expect(html).toContain("Referrals");
    expect(html).toContain(
      "Referral tracking began Sept 24, 2026. Nothing before that is counted.",
    );
    // 1 referred out of 3 signers since tracking start.
    expect(html).toContain("(33.3%)");
    expect(html).toMatch(/out of <span[^>]*>3<\/span>/);
    expect(html).toContain(`href="/signatories/${a}"`);
    expect(html).toContain("<details");
    expect(html).toContain('href="/admin/referrals"');
  });
});

describe("referral queries", () => {
  it("counts only referred signers who signed, over signers since tracking start", async () => {
    const a = await seed("Alice");
    await seed("Bob", { referredBy: a });
    await seed("Cara", { referredBy: a });
    // Referred but never signed: excluded from numerator and denominator.
    await seed("Ghost", { referredBy: a, signedAt: null });
    // Organic signer since tracking start: denominator only.
    await seed("Organic");
    // Signed before tracking began: excluded from the denominator.
    await seed("Early", { createdAt: BEFORE, signedAt: BEFORE });

    expect(await getReferralTotals(db)).toEqual({
      referredSigners: 2,
      signersSinceTrackingStart: 4, // Alice, Bob, Cara, Organic
    });
  });

  it("ranks referrers by count, ties by name, and lists who they brought in", async () => {
    const zed = await seed("Zed");
    const amy = await seed("Amy");
    const top = await seed("Top");
    // A referrer need not have signed themselves to be credited.
    const unsigned = await seed("Unsigned", { signedAt: null });

    const d1 = new Date(AFTER.getTime() + 1000);
    const d2 = new Date(AFTER.getTime() + 2000);
    const t1 = await seed("T1", { referredBy: top, signedAt: d1 });
    const t2 = await seed("T2", { referredBy: top, signedAt: d2 });
    await seed("Z1", { referredBy: zed });
    await seed("A1", { referredBy: amy });
    await seed("U1", { referredBy: unsigned });
    // Only an unsigned referral: must not appear at all.
    const nobody = await seed("Nobody");
    await seed("N1", { referredBy: nobody, signedAt: null });

    const ranked = await listReferrers(db);
    expect(ranked.map((r) => [r.displayName, r.count])).toEqual([
      ["Top", 2],
      ["Amy", 1],
      ["Unsigned", 1],
      ["Zed", 1],
    ]);

    const topRow = ranked[0];
    expect(topRow.signerId).toBe(top);
    // Newest first, with their signature date.
    expect(topRow.referred.map((p) => p.signerId)).toEqual([t2, t1]);
    expect(topRow.referred[0].signedAt.getTime()).toBe(d2.getTime());
    expect(topRow.referred[1].displayName).toBe("T1");
  });

  it("counts a referred signer with several signatures once, dated by the earliest", async () => {
    const a = await seed("Alice");
    const early = new Date(AFTER.getTime() + 1000);
    const b = await seed("Bob", { referredBy: a, signedAt: early });
    const [v2] = await db
      .insert(versions)
      .values({
        version: "2.0.0",
        publishedAt: new Date(),
        markdownHash: "d".repeat(64),
        agentsMdHash: "e".repeat(64),
        specJsonHash: "f".repeat(64),
        parsedJson: {},
      })
      .returning({ id: versions.id });
    const [c] = await db
      .insert(consentRecords)
      .values({ signerId: b, consentTextHash: "h" })
      .returning({ id: consentRecords.id });
    await db.insert(signatures).values({
      signerId: b,
      versionId: v2.id,
      versionHashAtSigning: "h",
      consentRecordId: c.id,
      signedAt: new Date(AFTER.getTime() + 99_000),
    });

    const [row] = await listReferrers(db);
    expect(row.count).toBe(1);
    expect(row.referred[0].signedAt.getTime()).toBe(early.getTime());
    expect((await getReferralTotals(db)).referredSigners).toBe(1);
  });
});
