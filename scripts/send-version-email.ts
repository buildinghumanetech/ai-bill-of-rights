/**
 * Version emails: the one-time relaunch email, and an email per new version.
 *
 *   # Dry run (the default): who would get it, by preference, and a sample.
 *   pnpm tsx scripts/send-version-email.ts relaunch --env ~/prod.env
 *   pnpm tsx scripts/send-version-email.ts version 0.2.0 --env ~/prod.env
 *
 *   # One test email to one address, greeting --test-name. Its signer number
 *   # and share link are the signer named --test-signer (default: the
 *   # sender, Erika Anderson). Records nothing, looks up no addresses, and
 *   # its unsubscribe link is a placeholder.
 *   pnpm tsx scripts/send-version-email.ts relaunch --env ~/prod.env --test-to you@example.com --test-name Erika
 *
 *   # The real send. --confirm must equal the recipient count the dry run
 *   # printed, so a changed audience or a stray flag can't send by accident.
 *   pnpm tsx scripts/send-version-email.ts relaunch --env ~/prod.env --send --confirm 57
 *
 * The dry run and --send read addresses from Clerk, so they need the real
 * CLERK_SECRET_KEY (`vercel env pull` redacts it; pass it in a second --env
 * file). Needs migration 0016 (email_sends) applied before --send. Each
 * signer gets each campaign at most once, however many times this runs.
 */

import { config } from "dotenv";
import os from "node:os";

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
// --env takes one file or a comma-separated list, e.g. the pulled production
// env plus a separate file holding CLERK_SECRET_KEY, which `vercel env pull`
// redacts. Later files win.
for (const p of (flag("env") ?? ".env.local").split(",")) {
  config({ path: p.trim().replace(/^~/, os.homedir()), override: true, quiet: true });
}

// Follows "We've created v0.1.0, which".
const RELAUNCH_SUMMARY =
  "adds Freedom From Algorithmic Discrimination and A Right to Safe, Tested Systems, and revises the wording of Articles 1, 4, 5 and 7.";

async function main(): Promise<void> {
  const [mode, versionArg] = args;
  if (mode !== "relaunch" && mode !== "version") {
    throw new Error('First argument must be "relaunch" or "version <x.y.z>".');
  }

  // Dynamic imports so dotenv has populated process.env first.
  const { db } = await import("@/lib/db");
  const { readVersionsIndex } = await import("@/lib/content/versions-index");
  const { sendEmailBatch } = await import("@/lib/email/send");
  const campaign = await import("@/server/email/campaign");
  const { lookupContacts } = await import("@/server/email/contacts");
  const { sql } = await import("drizzle-orm");

  const index = readVersionsIndex();
  const version = mode === "relaunch" ? index.current : versionArg;
  const entry = index.history.find((h) => h.version === version);
  if (!entry) throw new Error(`No versions.json entry for ${version}.`);

  let spec: import("@/server/email/campaign").CampaignSpec;
  if (mode === "relaunch") {
    // A relaunch counts as a major revision, whatever the version's level.
    spec = {
      campaign: `relaunch-${version}`,
      version,
      level: "major",
      publishedAt: entry.published_at,
      summary: RELAUNCH_SUMMARY,
      relaunch: true,
    };
  } else {
    if (!entry.level) throw new Error(`versions.json entry ${version} has no "level".`);
    const summary = entry.changelog?.trim();
    if (!summary) throw new Error(`versions.json entry ${version} has no changelog.`);
    if (/[—–]/.test(summary)) {
      throw new Error(`The ${version} changelog has an em or en dash; the email copy may not.`);
    }
    spec = {
      campaign: `version-${version}`,
      version,
      level: entry.level,
      publishedAt: entry.published_at,
      summary,
      relaunch: false,
    };
  }

  const testTo = flag("test-to");
  if (testTo) {
    // The tester's own signer record supplies the signer number and share
    // link, so what they click in the test is theirs. --test-name stands in
    // for the display name in the greeting. No address lookup, no writes.
    const who = flag("test-signer") ?? campaign.SENDER.replace(/\s*<.*$/, "");
    const me = await campaign.findTestSigner(db, who, testTo);
    const message = await campaign.renderMessage(
      db,
      spec,
      { ...me, displayName: flag("test-name") ?? "" },
      "test-placeholder-not-a-real-token",
      testTo,
      { createShareSlug: false },
    );
    const draft = message.text.match(/Spread the word:\n(mailto:\S+)/)?.[1] ?? "";
    const link = new URLSearchParams(draft.slice("mailto:?".length)).get("body")?.trim().split(/\s+/).pop();
    console.log(`Test uses signer "${me.displayName}" (${me.signerId}); share link ${link}.`);
    message.subject = `[Test] ${message.subject}`;
    await sendEmailBatch([message]);
    console.log(`Sent ONE test email to ${testTo}. Nothing was recorded.`);
    return;
  }

  const clerkKey = process.env.CLERK_SECRET_KEY ?? "";
  if (!clerkKey.startsWith("sk_")) {
    throw new Error(
      "CLERK_SECRET_KEY is missing or redacted (vercel env pull hides it). Put the production key in a file outside the repo and pass --env <prod.env>,<clerk.env>.",
    );
  }
  const { recipients, report } = await campaign.buildAudience(db, spec, (c) =>
    lookupContacts(db, c),
  );

  let alreadySent = 0;
  let tableExists = true;
  try {
    const rows = await db.execute(
      sql`select count(*)::int as n from email_sends where campaign = ${spec.campaign}`,
    );
    alreadySent = Number((rows.rows ?? rows)[0]?.n ?? 0);
  } catch {
    tableExists = false;
  }

  console.log(`\nCampaign ${spec.campaign} (${spec.level}), v${spec.version}`);
  console.log(`Signers considered: ${report.signers}`);
  console.log("Excluded:", report.excluded);
  console.log(
    `Recipients: ${report.recipients.total} (preference major: ${report.recipients.major}, minor: ${report.recipients.minor})`,
  );
  console.log(
    tableExists
      ? `Already sent this campaign: ${alreadySent}`
      : "email_sends table is missing: apply drizzle/0016_email_sends.sql before --send.",
  );

  if (!args.includes("--send")) {
    const sample = recipients[0];
    if (sample) {
      const m = await campaign.renderMessage(db, spec, sample, "SAMPLE-TOKEN", "sample@example.com", {
        createShareSlug: false,
      });
      console.log(`\n--- Sample (dry run) ---\nFrom: ${m.from}\nReply-To: ${m.replyTo}\nSubject: ${m.subject}\n\n${m.text}\n`);
    }
    console.log("Dry run: nothing was sent. Add --send --confirm <recipients> to send.");
    return;
  }

  if (!tableExists) throw new Error("Apply drizzle/0016_email_sends.sql before sending.");
  const confirm = Number(flag("confirm"));
  if (confirm !== report.recipients.total) {
    throw new Error(
      `--confirm ${flag("confirm") ?? "(missing)"} does not match the ${report.recipients.total} recipients. Nothing was sent.`,
    );
  }
  const result = await campaign.sendCampaign(db, spec, recipients, sendEmailBatch, {
    batchSize: 100,
    maxErrorRate: 0.02,
    pauseMs: 1000,
  });
  console.log("\nResult:", result);
  if (result.stoppedEarly) {
    console.log("Stopped early: failures passed 2%. Fix the cause, then rerun; sent signers are skipped.");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
