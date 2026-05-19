import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { signers, consentRecords } = await import("@/lib/db/schema");
  const { eq, and } = await import("drizzle-orm");
  const rows = await db
    .select({
      signerId: signers.id,
      displayName: signers.displayName,
      clerkUserId: signers.clerkUserId,
      isAdmin: signers.isAdmin,
      capturedFields: consentRecords.capturedFields,
    })
    .from(signers)
    .leftJoin(consentRecords, eq(consentRecords.signerId, signers.id));
  for (const r of rows) {
    const cf = r.capturedFields as Record<string, unknown> | null;
    const email = cf?.contact_value ?? cf?.contact_email ?? null;
    console.log(`${r.displayName} (admin=${r.isAdmin}, ${r.clerkUserId}): contact=${email ?? "<none>"}`);
  }
}
main().catch((err) => { console.error(err); process.exit(1); });
