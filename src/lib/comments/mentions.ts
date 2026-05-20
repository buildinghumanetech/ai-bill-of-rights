/**
 * Parses @mentions from a comment body.
 *
 * Match strategy: scan the body left-to-right for `@`, then greedily match the
 * longest known display name that follows. This handles names with spaces
 * (e.g. "@Daniel Odio"). Returns the set of matched signer ids.
 */
export function parseMentions(
  body: string,
  knownSigners: { id: string; displayName: string }[],
): { signerId: string; displayName: string; matchStart: number; matchEnd: number }[] {
  // Sort signers by displayName length desc so longer names match before shorter
  const sorted = [...knownSigners].sort((a, b) => b.displayName.length - a.displayName.length);
  const out: { signerId: string; displayName: string; matchStart: number; matchEnd: number }[] = [];
  let i = 0;
  while (i < body.length) {
    if (body[i] !== "@") { i++; continue; }
    // Try each known display name as a prefix after the @
    let matched = false;
    for (const s of sorted) {
      const candidate = body.slice(i + 1, i + 1 + s.displayName.length);
      if (candidate === s.displayName) {
        out.push({
          signerId: s.id,
          displayName: s.displayName,
          matchStart: i,
          matchEnd: i + 1 + s.displayName.length,
        });
        i = i + 1 + s.displayName.length;
        matched = true;
        break;
      }
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
