import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { shareLinks } from "@/lib/db/schema";

/**
 * Short share links: theaibill.org/s/<slug> → /signatories/<id>?ref=<id>.
 *
 * A plain module, not a `"use server"` one — everything exported from a
 * `"use server"` file is POST-reachable, and `getOrCreateShareSlug` takes a
 * signer id, which is public by design.
 *
 * NOTHING HERE THROWS. The share_links table arrives by a hand-applied
 * migration (0014), and an unapplied migration must degrade sharing, never
 * signing: every failure — missing table included — returns null, and callers
 * fall back to the long /signatories/<id>?ref=<id> link.
 */

// No 0/o, 1/i/l: a slug may be read aloud or retyped from a screenshot.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const SLUG_LENGTH = 7;
const MAX_ATTEMPTS = 5;

/** What a slug looks like; anything else is not worth a database round trip. */
export const SLUG_RE = new RegExp(`^[${ALPHABET}]{${SLUG_LENGTH}}$`);

/** A random slug. 31^7 ≈ 27.5 billion, so collisions are retried, not feared. */
export function generateSlug(): string {
  const bytes = randomBytes(SLUG_LENGTH);
  let out = "";
  for (let i = 0; i < SLUG_LENGTH; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- same untyped drizzle client as @/lib/db/queries
type Db = any;

async function slugFor(db: Db, signerId: string): Promise<string | null> {
  const rows = await db
    .select({ slug: shareLinks.slug })
    .from(shareLinks)
    .where(eq(shareLinks.signerId, signerId))
    .limit(1);
  return rows[0]?.slug ?? null;
}

/**
 * The signer's slug, creating it on first use. Returns null — never throws —
 * when it can't, so the caller uses the long link instead.
 */
export async function getOrCreateShareSlug(
  db: Db,
  signerId: string,
): Promise<string | null> {
  try {
    const existing = await slugFor(db, signerId);
    if (existing) return existing;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const inserted = await db
        .insert(shareLinks)
        .values({ slug: generateSlug(), signerId })
        .onConflictDoNothing()
        .returning({ slug: shareLinks.slug });
      if (inserted[0]?.slug) return inserted[0].slug as string;
      // A conflict is either a slug collision (try another) or a concurrent
      // request that just created this signer's slug (use theirs).
      const raced = await slugFor(db, signerId);
      if (raced) return raced;
    }
    return null;
  } catch (err) {
    console.warn(
      "[share-links] could not get a short link; falling back to the long one:",
      err,
    );
    return null;
  }
}

/** The signer a slug points at, or null. Never throws. */
export async function resolveShareSlug(
  db: Db,
  slug: string,
): Promise<string | null> {
  if (!SLUG_RE.test(slug)) return null;
  try {
    const rows = await db
      .select({ signerId: shareLinks.signerId })
      .from(shareLinks)
      .where(eq(shareLinks.slug, slug))
      .limit(1);
    return rows[0]?.signerId ?? null;
  } catch (err) {
    console.warn("[share-links] could not resolve a short link:", err);
    return null;
  }
}
