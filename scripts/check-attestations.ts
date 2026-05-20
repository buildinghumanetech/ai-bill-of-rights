import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { db } = await import("@/lib/db");
  const { attestations, versions } = await import("@/lib/db/schema");
  const { eq, desc } = await import("drizzle-orm");
  const rows = await db.select({
    id: attestations.id,
    orgName: attestations.orgName,
    productName: attestations.productName,
    productUrl: attestations.productUrl,
    contactEmail: attestations.contactEmail,
    emailVerifiedAt: attestations.emailVerifiedAt,
    needsManualReview: attestations.needsManualReview,
    manuallyApproved: attestations.manuallyApproved,
    published: attestations.published,
    hiddenAt: attestations.hiddenAt,
    claimedAt: attestations.claimedAt,
    verificationToken: attestations.verificationToken,
    version: versions.version,
  })
  .from(attestations)
  .innerJoin(versions, eq(versions.id, attestations.versionId))
  .orderBy(desc(attestations.claimedAt))
  .limit(20);
  console.log(JSON.stringify(rows, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
