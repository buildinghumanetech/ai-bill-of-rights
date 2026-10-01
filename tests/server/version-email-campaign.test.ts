/**
 * Version emails against a real (pglite) database: who is in the audience,
 * that nobody is ever sent a campaign twice, and one-click unsubscribe.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { consentRecords, emailSends, shareLinks, signers } from "@/lib/db/schema";
import { recordSignature } from "@/server/signatures/record";
import {
  buildAudience,
  findTestSigner,
  renderMessage,
  sendCampaign,
  unsubscribeByToken,
  type Candidate,
  type CampaignSpec,
  type Contact,
} from "@/server/email/campaign";
import type { EmailMessage } from "@/lib/email/send";

const RELAUNCH: CampaignSpec = {
  campaign: "relaunch-0.1.0",
  version: "0.1.0",
  level: "major",
  publishedAt: "2026-07-24",
  summary: "It adds two articles.",
  relaunch: true,
};

const md = (v: string) =>
  `---\nversion: ${v}\npublished_at: 2026-05-18\n---\n\n# T {#preamble}\nx {#preamble-s-1}\n`;

let db: TestDb;

beforeEach(async () => {
  db = await createTestDb();
  await syncVersions(
    db,
    ["0.0.1", "0.1.0"].map((v) => ({
      version: v,
      publishedAt: new Date(),
      markdown: md(v),
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: v === "0.1.0",
      gitCommitSha: null,
    })),
  );
});

async function signer(
  name: string,
  opts: {
    signed?: string[];
    preference?: "major" | "minor" | "none";
    softBanned?: boolean;
  } = {},
): Promise<string> {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId: `user_${name}`,
      displayName: name,
      verificationMethod: "email",
      verifiedAt: new Date(),
      notificationPreference: opts.preference ?? "major",
      softBannedAt: opts.softBanned ? new Date() : null,
    })
    .returning({ id: signers.id });
  for (const v of opts.signed ?? ["0.0.1"]) {
    await recordSignature(db, {
      signerId: row.id,
      versionString: v,
      consentTextHash: "a".repeat(64),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      capturedFields: {} as any,
      allowArchivedVersion: true,
    });
  }
  return row.id as string;
}

/** Everyone has an address except names starting with "phone". */
const contacts = async (cs: Candidate[]) =>
  new Map<string, Contact>(
    cs
      .filter((c) => !c.displayName.startsWith("phone"))
      .map((c) => [c.signerId, { email: `${c.displayName}@example.com` }]),
  );

describe("the relaunch audience", () => {
  it("is earlier-version signers who haven't signed v0.1.0, minus 'none', and counts every exclusion", async () => {
    const major = await signer("major");
    const minor = await signer("minor", { preference: "minor" });
    await signer("none", { preference: "none" });
    await signer("current", { signed: ["0.1.0"] });
    await signer("both", { signed: ["0.0.1", "0.1.0"] });
    await signer("banned", { softBanned: true });
    await signer("phoneonly");
    const anon = await signer("anon");
    await db.update(consentRecords).set({ revokedAt: new Date() }).where(eq(consentRecords.signerId, anon));

    const { recipients, report } = await buildAudience(db, RELAUNCH, contacts);

    expect(recipients.map((r) => r.signerId).sort()).toEqual([major, minor].sort());
    expect(report).toEqual({
      signers: 8,
      excluded: {
        signedThisVersion: 2,
        anonymized: 1,
        softBanned: 1,
        preferenceNone: 1,
        preferenceMajorOnMinorVersion: 0,
        noEmail: 1,
      },
      recipients: { major: 1, minor: 1, total: 2 },
    });
    expect(recipients.find((r) => r.signerId === major)?.signedVersion).toBe("0.0.1");
  });

  it("a minor version update skips major-only subscribers and includes current signers", async () => {
    await signer("major", { signed: ["0.1.0"] });
    const minor = await signer("minor", { preference: "minor", signed: ["0.1.0"] });

    const { recipients, report } = await buildAudience(
      db,
      { ...RELAUNCH, campaign: "version-0.1.1", version: "0.1.1", level: "minor", relaunch: false },
      contacts,
    );

    expect(recipients.map((r) => r.signerId)).toEqual([minor]);
    expect(report.excluded.preferenceMajorOnMinorVersion).toBe(1);
  });
});

describe("sending", () => {
  it("sends once per signer, however many times it runs", async () => {
    await signer("a");
    await signer("b");
    const sent: EmailMessage[] = [];
    const send = async (m: EmailMessage[]) => void sent.push(...m);

    const { recipients } = await buildAudience(db, RELAUNCH, contacts);
    const first = await sendCampaign(db, RELAUNCH, recipients, send);
    const second = await sendCampaign(db, RELAUNCH, recipients, send);

    expect(first).toMatchObject({ sent: 2, skippedAlreadySent: 0, failed: 0 });
    expect(second).toMatchObject({ sent: 0, skippedAlreadySent: 2, failed: 0 });
    expect(sent.map((m) => m.to).sort()).toEqual(["a@example.com", "b@example.com"]);
    const rows = await db.select().from(emailSends);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.sentAt !== null)).toBe(true);
  });

  it("sends from Erika, replies to her, with one-click unsubscribe headers", async () => {
    await signer("a");
    const sent: EmailMessage[] = [];
    const { recipients } = await buildAudience(db, RELAUNCH, contacts);
    await sendCampaign(db, RELAUNCH, recipients, async (m) => void sent.push(...m));

    const [row] = await db.select().from(emailSends);
    expect(sent[0]).toMatchObject({
      from: "Erika Anderson <signature@theaibill.org>",
      replyTo: "erika@buildinghumanetech.com",
      headers: {
        "List-Unsubscribe": `<https://theaibill.org/api/unsubscribe/${row.unsubscribeToken}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    expect(sent[0].text).toContain(`https://theaibill.org/unsubscribe/${row.unsubscribeToken}`);
  });

  it("greets by display name and drafts Spread the word with their own short link", async () => {
    const id = await signer("Ada Lovelace");
    const sent: EmailMessage[] = [];
    const { recipients } = await buildAudience(db, RELAUNCH, contacts);
    await sendCampaign(db, RELAUNCH, recipients, async (m) => void sent.push(...m));

    const [link] = await db.select().from(shareLinks).where(eq(shareLinks.signerId, id));
    expect(link?.slug).toMatch(/^[a-z2-9]{7}$/);
    expect(sent[0].text.startsWith("Hi Ada, thanks for being signer #")).toBe(true);
    const draft = sent[0].text.match(/Spread the word:\n(mailto:\S+)/)?.[1] ?? "";
    const body = new URLSearchParams(draft.slice("mailto:?".length)).get("body");
    expect(body?.endsWith(`Will you sign too?\r\n\r\nhttps://theaibill.org/s/${link.slug}?via=email\r\n\r\n\r\n`)).toBe(true);
  });

  it("writes no share link for a dry run or test, and falls back to the bare site", async () => {
    await signer("a");
    const { recipients } = await buildAudience(db, RELAUNCH, contacts);
    const m = await renderMessage(db, RELAUNCH, recipients[0], "tok", "t@example.com", {
      createShareSlug: false,
    });
    expect(await db.select().from(shareLinks)).toHaveLength(0);
    expect(m.text).toContain("too%3F%0D%0A%0D%0Ahttps%3A%2F%2Ftheaibill.org%0D%0A%0D%0A%0D%0A\n");
  });

  it("finds the tester's own signer record by display name, or refuses", async () => {
    const erika = await signer("Erika Anderson", { signed: ["0.1.0"] });
    await signer("Erika");
    const me = await findTestSigner(db, "  erika   anderson ", "t@example.com");
    expect(me).toMatchObject({ signerId: erika, signedVersion: "0.1.0", email: "t@example.com" });

    await expect(findTestSigner(db, "Nobody", "t@example.com")).rejects.toThrow(/found 0/);
    await signer("erika  Anderson");
    await expect(findTestSigner(db, "Erika Anderson", "t@example.com")).rejects.toThrow(/found 2/);
  });

  it("releases a failed batch so a rerun retries it, and stops past 2% failures", async () => {
    for (const n of ["a", "b", "c"]) await signer(n);
    const { recipients } = await buildAudience(db, RELAUNCH, contacts);

    const failed = await sendCampaign(db, RELAUNCH, recipients, async () => {
      throw new Error("resend down");
    }, { batchSize: 1 });
    expect(failed).toMatchObject({ sent: 0, failed: 1, stoppedEarly: true });
    expect(await db.select().from(emailSends)).toHaveLength(0);

    const retried = await sendCampaign(db, RELAUNCH, recipients, async () => {});
    expect(retried).toMatchObject({ sent: 3, failed: 0, stoppedEarly: false });
  });
});

describe("unsubscribe", () => {
  it("sets the signer to 'none' by token, and rejects unknown tokens", async () => {
    const a = await signer("a", { preference: "minor" });
    const { recipients } = await buildAudience(db, RELAUNCH, contacts);
    await sendCampaign(db, RELAUNCH, recipients, async () => {});
    const [row] = await db.select().from(emailSends);

    expect(await unsubscribeByToken(db, "nope-nope-nope-nope-nope")).toBe(false);
    expect(await unsubscribeByToken(db, row.unsubscribeToken)).toBe(true);
    const [after] = await db.select().from(signers).where(eq(signers.id, a));
    expect(after.notificationPreference).toBe("none");

    // And they are out of the next version's audience.
    const next = await buildAudience(db, { ...RELAUNCH, campaign: "version-0.2.0", version: "0.2.0", relaunch: false }, contacts);
    expect(next.recipients).toHaveLength(0);
  });
});
