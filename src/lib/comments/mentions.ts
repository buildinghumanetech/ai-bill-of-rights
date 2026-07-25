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
 */

export interface ParsedMention {
  signerId: string;
  /** The signer's canonical display name, not the text the author typed. */
  displayName: string;
  matchStart: number;
  matchEnd: number;
}

/** Unicode-aware: an ASCII class would treat "ï" as a boundary. */
const WORD_CHAR = /[\p{L}\p{N}_]/u;
/** A mention's `@` may only follow whitespace or opening punctuation. */
const MENTION_OPENER = /[\s([{<"'‘“]/u;
const HAS_LETTER = /\p{L}/u;
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
 * A first name is only usable if it reads like a name. "Dr. Erika Anderson"
 * would otherwise make a bare "@Dr." a real mention, and "Anderson, Erika"
 * would contribute "anderson,".
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
    // Single-character first names are too collision-prone to be useful.
    const firstName = name.split(" ")[0];
    if (firstName.length >= 2 && firstName !== name && isNameLike(firstName)) {
      addCandidate(firstNames, firstName.toLowerCase(), signer.id);
      addScannable(firstName);
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
    // Only whitespace or opening punctuation may precede a mention's @. This
    // is what rejects every email local part regardless of script — bob@,
    // josé@, 田中@. It also means "end of sentence.@Alice" is not a mention;
    // that false negative is preferable to mailing the wrong person.
    if (i > 0 && !MENTION_OPENER.test(body[i - 1])) {
      i++;
      continue;
    }
    let matched = false;
    for (const candidate of scannable) {
      const end = i + 1 + candidate.len;
      if (body.slice(i + 1, end).toLowerCase() !== candidate.key) continue;
      // Reject a partial word: "@Erika" must not match the signer "Erik",
      // and "@Anaïs" must not match the signer "Ana".
      if (end < body.length && WORD_CHAR.test(body[end])) continue;
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
