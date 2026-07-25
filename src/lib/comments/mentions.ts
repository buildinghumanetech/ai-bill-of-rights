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
 * mean the `@` belongs to something else — an email address or a URL path.
 *
 * Rejecting a set is better than whitelisting openers: a whitelist silently
 * dropped ordinary mentions like "Hi,@Alice" and "cc:@Alice". `/` is essential
 * here — without it "https://medium.com/@alice" would notify signer Alice.
 *
 * Rejects bob@, josé@, 田中@, bob.smith@, medium.com/@alice, and
 * "sentence.@Alice". Known gap: the apostrophe is left OUT so that a quoted
 * "'@Alice'" still resolves, which means "bob'smith@alice.com" is not caught.
 */
const MENTION_BLOCKER = /[\p{L}\p{N}\p{M}_.+%\-/&!#=?~]/u;
const HAS_LETTER = /\p{L}/u;

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
  if (ch === "-") return isWordCharAt(body, end + 1);
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
    if (i > 0 && MENTION_BLOCKER.test(body[i - 1])) {
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
