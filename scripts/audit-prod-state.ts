/**
 * READ-ONLY: final post-deploy audit of prod state.
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const counts = await sql(`
    SELECT
      (SELECT count(*)::int FROM signers) AS signers,
      (SELECT count(*)::int FROM signatures) AS signatures,
      (SELECT count(*)::int FROM selfies) AS selfies,
      (SELECT count(*)::int FROM attestations) AS attestations,
      (SELECT count(*)::int FROM attestations WHERE published = true) AS attestations_published,
      (SELECT count(*)::int FROM proposed_edits) AS proposed_edits,
      (SELECT count(*)::int FROM comments) AS comments
  `);
  console.log("Totals:");
  for (const [k, v] of Object.entries((counts as any[])[0])) {
    console.log(`  ${k}: ${v}`);
  }

  // Surface signers that might have the name-format bug — i.e. those whose
  // display_name still looks like a full "First Last" string AND their
  // consent_record lacks the new name_display_format field.
  const possiblyBugged = await sql(`
    SELECT s.id, s.display_name, s.created_at,
      cr.captured_fields ? 'name_display_format' AS has_format_marker
    FROM signers s
    JOIN consent_records cr ON cr.signer_id = s.id
    WHERE s.display_name ~ '^[A-Z][a-z]+ [A-Z][a-z]+$'
    ORDER BY s.created_at DESC
  `);
  console.log(`\nPlain "First Last"-style names (possibly bug victims): ${(possiblyBugged as any[]).length}`);
  for (const r of possiblyBugged as any[]) {
    const marker = r.has_format_marker ? "[new flow]" : "[pre-fix]";
    console.log(`  ${marker} ${r.display_name} (${r.id})`);
  }

  // Encoded location rows (should be zero now)
  const enc = await sql(`SELECT count(*)::int AS n FROM signers WHERE location_text LIKE '%\\%%' ESCAPE '\\'`);
  console.log(`\nSigners with %-encoded location_text remaining: ${(enc as any[])[0].n}`);

  // Attestation row
  const att = await sql(`SELECT org_name, product_name, published, email_verified_at FROM attestations`);
  console.log(`\nAttestations: ${(att as any[]).length}`);
  for (const r of att as any[]) {
    console.log(`  ${r.org_name} / ${r.product_name} — published=${r.published}, verified=${r.email_verified_at !== null}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
