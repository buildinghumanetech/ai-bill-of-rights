/**
 * Parses @mentions from a comment body.
 *
 * The composer has no mention autocomplete — people type names by hand — so
 * matching has to tolerate what humans actually write. "@erika" and "@Erika"
 * both have to reach a signer named "Erika Anderson"; requiring the exact,
 * exactly-cased full display name meant real mentions silently notified nobody.
 *
 * Match strategy: scan left-to-right for an `@` that starts a word, then take
 * the LONGEST candidate name that follows, compared case-insensitively and
 * required to end on a word boundary. Candidates are each signer's full
 * display name plus their first name, so "@Erika Anderson" and "@Erika" both
 * resolve.
 *
 * The word-boundary requirement is what keeps a signer named "Erik" from being
 * matched inside "@Erika" — notifying the wrong person is worse than notifying
 * nobody. For the same reason, a candidate that could mean more than one signer
 * (two signers sharing a first name) resolves to nobody rather than guessing.
 * Full display names take precedence over first names, so a signer literally
 * named "Erika" still wins "@Erika" over another signer's first name.
 */

export interface ParsedMention {
  signerId: string;
  /** The signer's canonical display name, not the text the author typed. */
  displayName: string;
  matchStart: number;
  matchEnd: number;
}

const WORD_CHAR = /[A-Za-z0-9_]/;

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

export function parseMentions(
  body: string,
  knownSigners: { id: string; displayName: string }[],
): ParsedMention[] {
  const fullNames = new Map<string, string | null>();
  const firstNames = new Map<string, string | null>();
  const nameBySignerId = new Map<string, string>();

  for (const signer of knownSigners) {
    const name = signer.displayName.trim();
    if (!name) continue;
    nameBySignerId.set(signer.id, signer.displayName);
    addCandidate(fullNames, name.toLowerCase(), signer.id);
    // Single-character first names are too collision-prone to be useful.
    const firstName = name.split(/\s+/)[0];
    if (firstName.length >= 2 && firstName !== name) {
      addCandidate(firstNames, firstName.toLowerCase(), signer.id);
    }
  }

  // Full names are layered over first names so an exact full-name match wins.
  const index = new Map(firstNames);
  for (const [key, signerId] of fullNames) index.set(key, signerId);

  const candidates = [...index.keys()].sort((a, b) => b.length - a.length);
  if (candidates.length === 0) return [];

  const out: ParsedMention[] = [];
  let i = 0;
  while (i < body.length) {
    if (body[i] !== "@") {
      i++;
      continue;
    }
    // A mention's @ starts a word, which skips the @ inside email addresses.
    if (i > 0 && WORD_CHAR.test(body[i - 1])) {
      i++;
      continue;
    }
    let matched = false;
    for (const candidate of candidates) {
      const end = i + 1 + candidate.length;
      if (body.slice(i + 1, end).toLowerCase() !== candidate) continue;
      // Reject a partial word: "@Erika" must not match the signer "Erik".
      if (end < body.length && WORD_CHAR.test(body[end])) continue;
      const signerId = index.get(candidate) ?? null;
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
