import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";
import fs from "node:fs";
config({ path: ".env.local" });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  const before = await sql(
    `SELECT to_regclass('public.selfies') as selfies, to_regclass('public.selfie_reports') as selfie_reports`,
  );
  console.log("Pre-check:", before);

  const file = fs.readFileSync("drizzle/0002_add_selfies.sql", "utf8");
  // Split on semicolons followed by newline. Filter out comment-only chunks.
  const stmts = file
    .split(/;\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^(--.*\n?)+$/.test(s));

  for (const s of stmts) {
    const preview = s.replace(/\s+/g, " ").slice(0, 80);
    try {
      await sql(s);
      console.log(`✓ ${preview}...`);
    } catch (e) {
      const msg = (e as Error).message;
      if (msg.includes("already exists")) {
        console.log(`= already exists: ${preview}...`);
      } else {
        console.error(`× ${preview}...`);
        console.error("  ", msg);
        throw e;
      }
    }
  }

  const after = await sql(
    `SELECT to_regclass('public.selfies') as selfies, to_regclass('public.selfie_reports') as selfie_reports`,
  );
  console.log("Post-check:", after);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
