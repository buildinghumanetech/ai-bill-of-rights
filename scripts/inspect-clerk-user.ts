import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Usage: pnpm tsx scripts/inspect-clerk-user.ts <clerk-user-id>");
    process.exit(1);
  }
  const { clerkClient } = await import("@clerk/nextjs/server");
  const clerk = await clerkClient();
  const user = await clerk.users.getUser(userId);
  console.log(JSON.stringify({
    id: user.id,
    primaryEmailAddressId: user.primaryEmailAddressId,
    primaryPhoneNumberId: user.primaryPhoneNumberId,
    emailAddresses: user.emailAddresses.map((e) => ({ id: e.id, email: e.emailAddress, verified: e.verification?.status })),
    phoneNumbers: user.phoneNumbers.map((p) => ({ id: p.id, phone: p.phoneNumber, verified: p.verification?.status })),
    firstName: user.firstName,
    lastName: user.lastName,
  }, null, 2));
}
main().catch((err) => { console.error(err); process.exit(1); });
