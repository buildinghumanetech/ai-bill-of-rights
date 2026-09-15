/**
 * Tell a database failure's *kind* apart, so a caller that deliberately does
 * not 500 can still say which thing went wrong.
 *
 * WHY THIS EXISTS. `/propose` selects `proposed_edits.title`, a column added by
 * `drizzle/0011`. Migrations here are applied by hand (see AGENTS.md), so a
 * deploy that has not had it run throws `column "title" does not exist` on
 * every request. Swallowed by a bare `catch {}`, that renders as "Nothing
 * proposed yet" — an un-migrated deploy, a database outage and a genuinely
 * empty queue become the same screen, and the first two look like the third
 * indefinitely because nobody is paged by an empty state.
 *
 * Classification is by SQLSTATE where the driver supplies one, because message
 * text varies across driver and server version; the message regexes are a
 * fallback for wrapped errors that lost the code. `cause` is walked because
 * the Neon HTTP driver wraps the underlying fetch failure.
 */

export type DbErrorKind = "schema" | "connection" | "unknown";

/** 42703 undefined_column, 42P01 undefined_table — i.e. a missing migration. */
const SCHEMA_SQLSTATES = new Set(["42703", "42P01"]);

/** SQLSTATE class 08 is connection exception; the rest are Node socket errors. */
const CONNECTION_SQLSTATES = new Set([
  "08000",
  "08001",
  "08003",
  "08004",
  "08006",
  "08007",
  "08P01",
  "57P01",
  "57P03",
]);

const CONNECTION_SYSCALLS = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
]);

const SCHEMA_MESSAGE = /\b(column|relation|table)\b[^]*\bdoes not exist\b/i;
const CONNECTION_MESSAGE =
  /\b(fetch failed|failed to fetch|socket hang up|connection (refused|reset|closed|terminated)|could not connect|network|timed? ?out|DATABASE_URL is not set)\b/i;

/** Every error in the `cause` chain, nearest first. Cycle-safe, depth-capped. */
function chain(err: unknown): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<unknown>();
  let cur = err;
  while (cur != null && !seen.has(cur) && out.length < 10) {
    out.push(cur);
    seen.add(cur);
    cur = (cur as { cause?: unknown }).cause;
  }
  return out;
}

function codeOf(err: unknown): string | null {
  const c = (err as { code?: unknown } | null)?.code;
  return typeof c === "string" ? c : null;
}

export function classifyDbError(err: unknown): DbErrorKind {
  const links = chain(err);

  // Codes first — they are unambiguous where present.
  for (const link of links) {
    const code = codeOf(link);
    if (!code) continue;
    if (SCHEMA_SQLSTATES.has(code)) return "schema";
    if (CONNECTION_SQLSTATES.has(code) || CONNECTION_SYSCALLS.has(code)) {
      return "connection";
    }
  }

  // Then message text, for errors that crossed a boundary and lost the code.
  for (const link of links) {
    const message = (link as { message?: unknown } | null)?.message;
    if (typeof message !== "string") continue;
    if (SCHEMA_MESSAGE.test(message)) return "schema";
    if (CONNECTION_MESSAGE.test(message)) return "connection";
  }

  return "unknown";
}
