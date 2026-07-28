import type { ReactNode } from "react";
import { mentionText } from "./resolved-mentions";

/**
 * Renders a comment body with @mentions styled as highlighted spans. Safe for
 * React rendering — no dangerouslySetInnerHTML.
 *
 * **Highlighting is driven by the stored `comment_mentions` rows, not by reading
 * the prose.** Those rows are exactly the signers the author picked from the
 * typeahead, and exactly who the notification was sent to. Anything else the
 * author typed that merely looks like a mention renders as ordinary text.
 *
 * That symmetry is the whole design. The previous version parsed the body with
 * `parseMentions` and highlighted whatever it recognised, which meant a
 * hand-typed `@Alice Nguyen` rendered fully styled while notifying nobody — the
 * comment looked like it had reached her and it never had. Guessing recipients
 * out of prose is the failure `resolved-mentions.ts` exists to end; the fix there
 * only held for delivery, and this closes the display half of the same gap.
 *
 * The needle is `mentionText(displayName)`, the same string the composer inserted
 * and the same one the server checked before sending mail, so display and
 * delivery cannot disagree about what counts as a mention.
 */
export function renderBodyWithMentions(
  body: string,
  knownSigners: readonly { id: string; displayName: string }[],
  mentionedSignerIds: readonly string[],
): ReactNode[] {
  const ranges = findMentionRanges(body, knownSigners, mentionedSignerIds);
  if (ranges.length === 0) return [body];

  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (cursor < range.start) nodes.push(body.slice(cursor, range.start));
    nodes.push(
      <span
        // Two mentions of the same signer in one body share a signer id, so the
        // offset is what keeps sibling keys distinct.
        key={`${range.signerId}-${range.start}`}
        className="rounded bg-blue-50 px-1 text-blue-700"
      >
        {body.slice(range.start, range.end)}
      </span>,
    );
    cursor = range.end;
  }
  if (cursor < body.length) nodes.push(body.slice(cursor));

  return nodes;
}

interface MentionRange {
  start: number;
  end: number;
  signerId: string;
}

/**
 * Every position where a mentioned signer's inserted text appears, in document
 * order and non-overlapping.
 *
 * Overlap is real rather than theoretical: "@Erik" occurs inside
 * "@Erika Anderson", so when both signers were picked the same characters match
 * two needles. Longer needles win, which keeps a name from being chopped in half
 * — the same containment quirk documented in `resolved-mentions.ts`, resolved
 * here in favour of the more specific name.
 */
function findMentionRanges(
  body: string,
  knownSigners: readonly { id: string; displayName: string }[],
  mentionedSignerIds: readonly string[],
): MentionRange[] {
  const byId = new Map(knownSigners.map((s) => [s.id, s]));
  const found: MentionRange[] = [];

  for (const id of new Set(mentionedSignerIds)) {
    // A row can outlive the signer list it was written against; with no display
    // name there is no needle, so there is nothing to highlight.
    const signer = byId.get(id);
    if (!signer) continue;
    const needle = mentionText(signer.displayName);
    // A blank display name would make `needle` a bare "@" and match everywhere.
    if (needle.length <= 1) continue;
    // Plain `indexOf`, never a constructed regex: a display name containing
    // regex metacharacters needs no escaping and cannot change the semantics.
    for (let at = body.indexOf(needle); at !== -1; at = body.indexOf(needle, at + needle.length)) {
      // Skip a match that stops in the middle of a longer word. Picking "Erik"
      // and then hand-typing "@Erika Anderson" puts "@Erik" inside a name that
      // was never picked; highlighting it would slice that name into a styled
      // "@Erik" plus a plain "a Anderson" and visually attribute the text to the
      // wrong person. Longest-wins below only helps when BOTH names have rows,
      // so this is the case it cannot see. Under-highlighting is the safe
      // direction: the mention is still delivered, it just is not dressed up.
      const next = body[at + needle.length];
      if (next !== undefined && /[\p{L}\p{N}]/u.test(next)) continue;
      found.push({ start: at, end: at + needle.length, signerId: id });
    }
  }

  // Earliest first; at equal starts the longer match wins, so the greedy pass
  // below takes "@Erika Anderson" over the "@Erik" nested inside it.
  found.sort((a, b) => a.start - b.start || b.end - a.end);

  const kept: MentionRange[] = [];
  for (const range of found) {
    const prev = kept[kept.length - 1];
    if (prev && range.start < prev.end) continue;
    kept.push(range);
  }
  return kept;
}
