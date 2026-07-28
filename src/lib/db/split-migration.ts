/**
 * Split a migration file into the statements that will actually be executed.
 *
 * Shared by `scripts/apply-migration.ts` (which runs them against production)
 * and the migration tests (which run them against pglite), so the two cannot
 * disagree about what production will execute.
 *
 * Drizzle files separate statements with `--> statement-breakpoint`.
 * Hand-written files without that marker fall back to splitting on `;` at
 * end-of-line. Comment lines are preserved inside a statement; chunks that are
 * nothing but comments are dropped.
 */
export function splitMigrationSql(raw: string): string[] {
  const breakpoint = "--> statement-breakpoint";
  const chunks = raw.includes(breakpoint)
    ? raw.split(breakpoint)
    : raw.split(/;\s*\n/);

  return chunks
    .map((s) => s.trim().replace(/;$/, "").trim())
    .filter((s) => s.length > 0 && !isCommentOnly(s));
}

/** True when every non-blank line in the chunk is a `--` comment. */
function isCommentOnly(chunk: string): boolean {
  return chunk
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .every((line) => line.trim().startsWith("--"));
}
