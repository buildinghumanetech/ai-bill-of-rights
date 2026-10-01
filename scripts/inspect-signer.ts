/**
 * READ-ONLY: inspect a specific signer's stored fields.
 * Usage: pnpm tsx scripts/inspect-signer.ts <signerId>
 */
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const id = process.argv[2];
  if (!id) {
    console.error("Usage: pnpm tsx scripts/inspect-signer.ts <signerId>");
    process.exit(2);
  }
  const rows = await sql(
    `SELECT id, display_name, affiliation, location_text, verification_method, clerk_user_id, created_at
     FROM signers WHERE id = $1`,
    [id],
  );
  if ((rows as Array<Record<string, unknown>>).length === 0) {
    console.log(`No signer with id ${id}`);
    return;
  }
  const r = (rows as Array<Record<string, unknown>>)[0];
  console.log("Signer row:");
  console.log(`  id:               ${r.id}`);
  console.log(`  display_name:     ${JSON.stringify(r.display_name)}`);
  console.log(`  affiliation:      ${JSON.stringify(r.affiliation)}`);
  console.log(`  location_text:    ${JSON.stringify(r.location_text)}`);
  console.log(`  verification:     ${r.verification_method}`);
  console.log(`  clerk_user_id:    ${r.clerk_user_id}`);
  console.log(`  created_at:       ${r.created_at}`);

  const cr = await sql(
    `SELECT captured_fields FROM consent_records WHERE signer_id = $1
     ORDER BY consented_at DESC LIMIT 1`,
    [id],
  );
  const captured = (cr as Array<Record<string, unknown>>)[0]?.captured_fields;
  // jsonb comes back as `unknown`; narrow to an object before indexing it rather
  // than asserting a shape this script cannot know.
  if (captured && typeof captured === "object") {
    const f = captured as Record<string, unknown>;
    console.log("\nMost recent consent_records.captured_fields (interesting bits):");
    const interesting = ["nameDisplayFormat", "firstName", "lastName", "raw_display_name"];
    for (const k of interesting) {
      if (k in f) console.log(`  ${k}: ${JSON.stringify(f[k])}`);
    }
    // Also dump full for inspection
    console.log("\n  (full captured_fields keys):", Object.keys(f).join(", "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
