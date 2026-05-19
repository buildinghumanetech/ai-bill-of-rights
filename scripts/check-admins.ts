import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { signers } = await import("@/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const all = await db.select({
    id: signers.id,
    clerkUserId: signers.clerkUserId,
    displayName: signers.displayName,
    isAdmin: signers.isAdmin,
    softBannedAt: signers.softBannedAt,
  }).from(signers);
  console.log("Total signers:", all.length);
  const admins = all.filter((s: { isAdmin: boolean }) => s.isAdmin);
  console.log("Admins:", admins.length);
  console.log(JSON.stringify(all, null, 2));
}
main().catch((err) => { console.error(err); process.exit(1); });
