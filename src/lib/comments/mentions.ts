/**
 * Parses @mentions from a comment body.
 *
 * The composer has no mention autocomplete — people type names by hand — so
 * matching has to tolerate what humans actually write. "@erika" and "@Erika"
 * both have to reach a signer named "Erika Anderson"; requiring the exact,
 * exactly-cased full display name meant real mentions silently notified nobody.
 *
 * Match strategy: scan left-to-right for an `@` that opens a mention, then take
 * the LONGEST candidate name that follows, compared case-insensitively and
 * required to end on a word boundary. Candidates are each signer's full
 * display name plus their first name, so "@Erika Anderson" and "@Erika" both
 * resolve.
 *
 * The word-boundary requirement is what keeps a signer named "Erik" from being
 * matched inside "@Erika" — notifying the wrong person is worse than notifying
 * nobody. Boundaries are Unicode-aware for the same reason: an ASCII-only
 * class would let a signer "Ana" match inside "@Anaïs". For the same reason, a
 * candidate that could mean more than one signer resolves to nobody rather than
 * guessing. Full display names take precedence over first names, so a signer
 * literally named "Erika" still wins "@Erika" over another signer's first name.
 *
 * KNOWN LIMITATION: names are compared without Unicode normalization, so a
 * mention typed in NFD ("Mari" + combining acute + "a") will not match a signer
 * stored in NFC ("María"). That fails SAFE — it notifies nobody rather than the
 * wrong person — so it's left alone here; normalizing would shift every match
 * offset and the renderer slices the original body.
 */

export interface ParsedMention {
  signerId: string;
  /** The signer's canonical display name, not the text the author typed. */
  displayName: string;
  matchStart: number;
  matchEnd: number;
}

/**
 * Characters that continue a word. Unicode-aware, because an ASCII class treats
 * "ï" as a boundary and lets signer "Ana" match inside "@Anaïs". `\p{M}` is
 * included so decomposed (NFD) text — where "ä" is "a" + U+0308 — doesn't
 * reopen that same hole.
 *
 * Deliberately EXCLUDES the apostrophe, so "@Bob's point" resolves to Bob, and
 * excludes the hyphen, which `endsMidWord` handles with more nuance.
 */
const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u;
/**
 * Characters that may NOT immediately precede a mention's `@`, because they
 * mean the `@` is part of an email local part rather than opening a mention.
 *
 * Rejecting a set beats whitelisting openers, which silently dropped ordinary
 * mentions like "Hi,@Alice" and "cc:@Alice". The set is kept to what a
 * realistic address actually needs: adding `& ! # = ? ~` for RFC completeness
 * bought no coverage (the set still isn't RFC-complete, since `'` is
 * deliberately out so a quoted "'@Alice'" resolves) while silently dropping
 * "Great!@Alice" and "Really?@Alice".
 *
 * This is only the LAST resort in `isBlockedOpener`: `isInUrlToken` and
 * `isEmailAt` decide from the surrounding token first, because no character
 * class can tell "medium.com/@alice" from "@Alice/@Bob", or "bob!@alice.com"
 * from "Great!@Alice". `/` is deliberately absent for that reason.
 */
const MENTION_BLOCKER = /[\p{L}\p{N}\p{M}_.+%-]/u;
const HAS_LETTER = /\p{L}/u;
/** Hyphens that can sit inside a name, including typographic variants that
 * arrive via paste or autocorrect. */
const NAME_HYPHENS = ["-", "‐", "‑"];
/**
 * A host ending in an alphabetic TLD of 2+ characters — "example.com", not the
 * "e.g" of a prose abbreviation and not the "v1.2" of a version number, both of
 * which a looser dotted pattern silently read as hosts and dropped mentions for.
 */
const TLD_HOST = /\.[\p{L}]{2,}$/u;
/** A dotted quad, whose all-numeric labels TLD_HOST deliberately won't match. */
const IPV4_HOST = /^\d{1,3}(?:\.\d{1,3}){3}$/;

/**
 * Whether `segment` looks like a hostname. Strips a port and a trailing FQDN
 * dot first, so "example.com:8080" and "example.com." both count.
 *
 * Known gap: a scheme-less, dot-less host ("localhost/@alice") isn't recognized.
 */
function isHostLike(segment: string): boolean {
  const host = segment.split(":")[0].replace(/\.$/, "");
  return TLD_HOST.test(host) || IPV4_HOST.test(host);
}

/**
 * Characters that can continue a URL immediately before an `@`. Excludes `,`,
 * `)` and `]`, which in prose and markdown end a URL rather than continue it —
 * otherwise "see https://example.com,@Alice" and "[d](https://x.com/d)@Alice"
 * lose their mention to the URL that happens to precede it.
 */
const URL_CHAR = /[\p{L}\p{N}\-._~:/?#&=%+@]/u;

/**
 * The code point ending at `i`, stepping back over a surrogate pair. Indexing
 * `body[i - 1]` would yield a lone low surrogate, which matches no Unicode
 * property — so an astral-script email local part ("𐐨@alice.com") would slip
 * past the opener check and mail the wrong person.
 */
function codePointBefore(body: string, i: number): string | undefined {
  if (i <= 0) return undefined;
  const cp = body.codePointAt(i - 1);
  if (cp === undefined) return undefined;
  // A low surrogate means the real code point may start one unit earlier — but
  // only if that unit is actually its HIGH surrogate. Comment bodies can hold
  // an unpaired surrogate (sanitizeText strips only C0/DEL), and stepping back
  // blindly would judge the opener against the wrong character entirely.
  if (cp >= 0xdc00 && cp <= 0xdfff && i >= 2) {
    const hi = body.charCodeAt(i - 2);
    if (hi >= 0xd800 && hi <= 0xdbff) {
      const full = body.codePointAt(i - 2);
      if (full !== undefined) return String.fromCodePoint(full);
    }
  }
  return String.fromCodePoint(cp);
}

/**
 * Whether the `@` at `i` sits inside a URL.
 *
 * Decided from the whole whitespace-delimited token rather than the single
 * preceding character. That distinction is the entire point: no character class
 * can tell "medium.com/@alice" (a URL) from "@Alice/@Bob" (two mentions), and
 * gating this check on one specific character just moves the hole to the next
 * one — `?ref=@alice`, `#@alice` and `&@alice` all reach the same wrong
 * recipient by a different route.
 *
 * A token is a URL if the part before the `@` has a scheme or ends in a dotted
 * host. "@Alice/@Bob", "and/or/@Alice", "Great!@Alice" and "e.g./@Alice" have
 * neither, so they still resolve.
 */
function isInUrlToken(body: string, i: number): boolean {
  // Scan back over URL characters only, so a URL that has already ended (at a
  // comma or a closing bracket) doesn't swallow a following mention.
  let start = i;
  while (start > 0 && URL_CHAR.test(body[start - 1])) start--;
  const before = body.slice(start, i);
  if (!before) return false;
  if (before.includes("://")) return true;
  // Take everything up to the first path/query/fragment separator, so what
  // isHostLike inspects ends at the host: "example.com/p?ref=" -> "example.com".
  return isHostLike(before.split(/[/?#]/u)[0]);
}

/**
 * Whether the `@` at `i` is the `@` of an email address.
 *
 * Decided from the token, not the preceding character: what actually marks an
 * address is a HOST after the `@`. That distinction is why "bob!@alice.com" is
 * an address while "Great!@Alice" is a mention — a character-based rule reads
 * both the same way, and every previous round of this file leaked one
 * wrong-recipient case per character left out of the class.
 */
function isEmailAt(body: string, i: number): boolean {
  let start = i;
  while (start > 0 && !/\s/u.test(body[start - 1])) start--;
  // No local part means no address, so a leading "@Alice" is safe.
  if (start === i) return false;
  let end = i + 1;
  while (end < body.length && !/[\s@]/u.test(body[end])) end++;
  return isHostLike(body.slice(i + 1, end));
}

/** Whether the `@` at `i` belongs to a URL or an email address. */
function isBlockedOpener(body: string, i: number): boolean {
  const prev = codePointBefore(body, i);
  if (prev === undefined) return false;
  if (isInUrlToken(body, i)) return true;
  if (isEmailAt(body, i)) return true;
  // A bare `/` outside a URL is an ordinary separator, as in "@Alice/@Bob".
  if (prev === "/") return false;
  return MENTION_BLOCKER.test(prev);
}

/**
 * Whether the character at `i` is a word char, tested by code POINT — indexing
 * a string yields one UTF-16 code unit, so an astral letter would otherwise be
 * a lone surrogate and never count as a word char.
 */
function isWordCharAt(body: string, i: number): boolean {
  if (i >= body.length) return false;
  const cp = body.codePointAt(i);
  return cp !== undefined && WORD_CHAR.test(String.fromCodePoint(cp));
}

/**
 * Whether a match ending at `end` cuts a word in half, which would make it a
 * partial-word false positive.
 *
 * A hyphen counts as continuing the word ONLY when a word char follows it. That
 * keeps signer "Jean" from matching inside "@Jean-Pierre", while still letting
 * "@Alice--" and a trailing "@Alice-" resolve — treating every hyphen as
 * intra-name would silently drop those, the same over-rejection this module
 * removed on the opener side.
 */
function endsMidWord(body: string, end: number): boolean {
  if (end >= body.length) return false;
  const cp = body.codePointAt(end);
  if (cp === undefined) return false;
  const ch = String.fromCodePoint(cp);
  // Typographic hyphens count too, or "@Jean‑Pierre" with a U+2011 would let
  // signer "Jean" match a partial word again.
  if (NAME_HYPHENS.includes(ch)) return isWordCharAt(body, end + ch.length);
  return WORD_CHAR.test(ch);
}
/**
 * Separates the two halves of a candidate's composite key. NUL genuinely
 * cannot appear in a display name, so the composite can never collide.
 * Written as an escape, not a literal byte, to keep this file plain text.
 */
const KEY_SEP = "\u0000";

interface Candidate {
  /** Lowercased name, used as the identity key. */
  key: string;
  /**
   * Length of the ORIGINAL name. Slicing by this and lowercasing the slice
   * keeps offsets in original-body space, which `key.length` would not when
   * case folding changes length (e.g. "İ" lowercases to two code units).
   */
  len: number;
}

/**
 * Records a lowercased name -> signerId. A key claimed by two different
 * signers is ambiguous and stored as null.
 */
function addCandidate(
  index: Map<string, string | null>,
  key: string,
  signerId: string,
): void {
  if (!index.has(key)) index.set(key, signerId);
  else if (index.get(key) !== signerId) index.set(key, null);
}

/**
 * A token is usable as a short name only if it reads like one — it must contain
 * a letter and not trail punctuation. This is what stops a bare "@Dr." from
 * being a real mention of "Dr. Erika Anderson".
 */
function isNameLike(token: string): boolean {
  return HAS_LETTER.test(token) && !/[.,;:]$/.test(token);
}

export function parseMentions(
  body: string,
  knownSigners: { id: string; displayName: string }[],
): ParsedMention[] {
  const fullNames = new Map<string, string | null>();
  const firstNames = new Map<string, string | null>();
  const nameBySignerId = new Map<string, string>();
  // Keyed on (lowercased name, original length) so two spellings that fold to
  // the same key but differ in original length are both scannable.
  const candidates = new Map<string, Candidate>();

  const addScannable = (name: string) => {
    const key = name.toLowerCase();
    candidates.set(key + KEY_SEP + name.length, { key, len: name.length });
  };

  for (const signer of knownSigners) {
    // Collapse internal runs of whitespace: a name stored as "Erika  Anderson"
    // would otherwise build a candidate nobody can type.
    const name = signer.displayName.trim().replace(/\s+/g, " ");
    if (!name) continue;
    nameBySignerId.set(signer.id, signer.displayName);
    addCandidate(fullNames, name.toLowerCase(), signer.id);
    addScannable(name);
    // Scan forward to the first USABLE token rather than taking token 0
    // outright: for "Dr. Erika Anderson" the short name is "Erika". Dropping
    // the candidate entirely would mean "@Erika" notified nobody, which is the
    // silent-miss failure this module exists to prevent. The length rule is
    // inside the predicate for the same reason — applying it after `find` would
    // let a bare initial ("J Erika Anderson") kill the candidate outright.
    // Single-character names are too collision-prone to be useful.
    const shortName = name
      .split(" ")
      .find((token) => token.length >= 2 && isNameLike(token));
    if (shortName && shortName !== name) {
      addCandidate(firstNames, shortName.toLowerCase(), signer.id);
      addScannable(shortName);
    }
  }

  // Full names are layered over first names so an exact full-name match wins.
  const index = new Map(firstNames);
  for (const [key, signerId] of fullNames) index.set(key, signerId);

  // Longest first, so "@Erika Anderson" beats the "Erika" first-name candidate.
  const scannable = [...candidates.values()].sort((a, b) => b.len - a.len);
  if (scannable.length === 0) return [];

  const out: ParsedMention[] = [];
  let i = 0;
  while (i < body.length) {
    if (body[i] !== "@") {
      i++;
      continue;
    }
    // Reject an @ that belongs to an email address or a URL path.
    // "sentence.@Alice" is caught by this too; that false negative is
    // preferable to mailing the wrong person.
    if (isBlockedOpener(body, i)) {
      i++;
      continue;
    }
    let matched = false;
    for (const candidate of scannable) {
      const end = i + 1 + candidate.len;
      if (body.slice(i + 1, end).toLowerCase() !== candidate.key) continue;
      // Reject a partial word: "@Erika" must not match the signer "Erik",
      // "@Anaïs" the signer "Ana", or "@Jean-Pierre" the signer "Jean".
      if (endsMidWord(body, end)) continue;
      const signerId = index.get(candidate.key) ?? null;
      if (signerId) {
        out.push({
          signerId,
          displayName: nameBySignerId.get(signerId)!,
          matchStart: i,
          matchEnd: end,
        });
      }
      // Ambiguous or not, this @-name is consumed — don't rescan inside it.
      i = end;
      matched = true;
      break;
    }
    if (!matched) i++;
  }

  // Dedupe by signerId — only send one email per mentioned user even if @-named twice
  const seen = new Set<string>();
  return out.filter((m) => {
    if (seen.has(m.signerId)) return false;
    seen.add(m.signerId);
    return true;
  });
}
