import { config } from "dotenv";
config({ path: ".env.local" });

/**
 * Adds an email address to a Clerk user via the Clerk Backend API.
 * Marks the new email as verified so it can immediately be used as the
 * primary (Resend send target). Use sparingly — production accounts should
 * normally add+verify their own email through the Clerk UI.
 *
 * Usage: pnpm tsx scripts/add-clerk-email.ts <clerk-user-id> <email>
 */
async function main() {
  const userId = process.argv[2];
  const emailRaw = process.argv[3];
  if (!userId || !emailRaw) {
    console.error("Usage: pnpm tsx scripts/add-clerk-email.ts <clerk-user-id> <email>");
    process.exit(1);
  }
  const email = emailRaw.trim();
  const { clerkClient } = await import("@clerk/nextjs/server");
  const clerk = await clerkClient();

  const before = await clerk.users.getUser(userId);
  const existing = before.emailAddresses.find(
    (e) => e.emailAddress.toLowerCase() === email.toLowerCase(),
  );
  let emailId = existing?.id;
  if (existing) {
    console.log(`Email already exists on user (id=${existing.id}, verified=${existing.verification?.status}).`);
  } else {
    const created = await clerk.emailAddresses.createEmailAddress({
      userId,
      emailAddress: email,
      verified: true,
      primary: !before.primaryEmailAddressId,
    });
    emailId = created.id;
    console.log(`Created email ${email} (id=${created.id}, verified=${created.verification?.status}).`);
  }
  if (!before.primaryEmailAddressId && emailId) {
    await clerk.users.updateUser(userId, { primaryEmailAddressID: emailId });
    console.log(`Set ${email} as primary.`);
  }
  const after = await clerk.users.getUser(userId);
  console.log("\nFinal identifiers:");
  console.log("  primaryEmailAddressId:", after.primaryEmailAddressId);
  console.log("  emailAddresses:", after.emailAddresses.map((e) => ({ id: e.id, email: e.emailAddress, verified: e.verification?.status })));
}
main().catch((err) => { console.error(err); process.exit(1); });
