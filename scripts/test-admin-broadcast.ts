import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Simulates the email-broadcast step of submitAttestationAction without
 * inserting a new row — just looks up admin emails (mirroring the production
 * helper) and fires the existing verify template to each one. Use to confirm
 * the Resend pipeline + admin routing both work end-to-end.
 */
async function main() {
  const { db } = await import("@/lib/db");
  const { attestations, consentRecords, signers, versions } = await import("@/lib/db/schema");
  const { and, eq, isNull, desc } = await import("drizzle-orm");
  const { attestationVerifyEmail } = await import("@/lib/email/templates");
  const { sendEmail } = await import("@/lib/email/send");

  const recent = await db
    .select({
      id: attestations.id,
      orgName: attestations.orgName,
      productName: attestations.productName,
      contactEmail: attestations.contactEmail,
      verificationToken: attestations.verificationToken,
      versionId: attestations.versionId,
    })
    .from(attestations)
    .orderBy(desc(attestations.claimedAt))
    .limit(1);
  if (recent.length === 0) {
    console.error("No attestations in DB. Submit one via the form first.");
    process.exit(1);
  }
  const att = recent[0];
  const v = await db.select().from(versions).where(eq(versions.id, att.versionId)).limit(1);
  const versionString = v[0]?.version ?? "0.1.0";

  const adminRows = await db
    .select({ signerId: signers.id, displayName: signers.displayName, clerkUserId: signers.clerkUserId })
    .from(signers)
    .where(and(eq(signers.isAdmin, true), isNull(signers.softBannedAt)));
  console.log(`Found ${adminRows.length} admin signers.`);

  const { clerkClient } = await import("@clerk/nextjs/server");
  const clerk = await clerkClient();
  const out = new Set<string>();
  for (const row of adminRows) {
    if (!row.clerkUserId.startsWith("admin-added-")) {
      try {
        const user = await clerk.users.getUser(row.clerkUserId);
        const primary = user.primaryEmailAddress?.emailAddress;
        if (primary) {
          out.add(primary.toLowerCase());
          console.log(`  - ${row.displayName} [Clerk primary]: ${primary}`);
          continue;
        }
        const any = user.emailAddresses[0]?.emailAddress;
        if (any) {
          out.add(any.toLowerCase());
          console.log(`  - ${row.displayName} [Clerk any]: ${any}`);
          continue;
        }
        console.log(`  - ${row.displayName}: no Clerk email`);
      } catch (err) {
        console.log(`  - ${row.displayName}: Clerk lookup failed:`, (err as Error).message);
      }
    }
    // Fall back to captured_fields.contact_value
    try {
      const consent = await db
        .select({ capturedFields: consentRecords.capturedFields })
        .from(consentRecords)
        .where(eq(consentRecords.signerId, row.signerId))
        .orderBy(desc(consentRecords.consentedAt))
        .limit(1);
      const cf = consent[0]?.capturedFields as Record<string, unknown> | null;
      const raw = (cf?.contact_value ?? cf?.contact_email ?? "") as string;
      if (raw && raw.includes("@")) {
        out.add(raw.toLowerCase());
        console.log(`  - ${row.displayName} [consent fallback]: ${raw}`);
      } else if (raw) {
        console.log(`  - ${row.displayName} [consent fallback]: ${raw} (not an email — skipped)`);
      }
    } catch (err) {
      console.log(`  - ${row.displayName}: consent lookup failed:`, (err as Error).message);
    }
  }
  const recipients = Array.from(out);

  if (recipients.length === 0) {
    console.error("\nNo admin emails to send to.");
    process.exit(2);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const tpl = attestationVerifyEmail({
    orgName: att.orgName,
    productName: att.productName,
    version: versionString,
    verifyUrl: `${siteUrl}/attestations/verify/${att.verificationToken}`,
    submitterEmail: att.contactEmail,
  });
  console.log(`\nSending '${tpl.subject}' to: ${recipients.join(", ")}`);
  await Promise.all(recipients.map((to) => sendEmail({ to, ...tpl })));
  console.log("All sends returned without throwing.");
  console.log(`\nVerify URL: ${siteUrl}/attestations/verify/${att.verificationToken}`);
}
main().catch((err) => { console.error(err); process.exit(1); });
