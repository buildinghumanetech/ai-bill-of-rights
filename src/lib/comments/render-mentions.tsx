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
 * The needle is `mentionText(displayName)` — the same string the composer
 * inserted and the same one the server checked before sending mail.
 *
 * Display is nonetheless strictly MORE CONSERVATIVE than delivery, and the
 * asymmetry is deliberate. Delivery uses plain containment with no boundary
 * rules at all, so a signer can be mailed for a body where their name only
 * appears inside an email address (the over-keep documented in
 * `resolved-mentions.ts`). Highlighting applies the boundary checks below on
 * top, so it can decline to style a mention that was genuinely delivered. It can
 * never do the reverse: nothing is styled that was not picked and recorded.
 * Under-highlighting is the safe direction — a missing highlight is a cosmetic
 * loss, a wrong one attributes someone's words to a person who never wrote them.
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

/**
 * Characters that can appear in an email local part, which is what the leading
 * edge is defending against and the ONLY thing it should reject.
 *
 * Deliberately ASCII. A previous version used `/[\p{L}\p{N}_]/u` here, and that
 * broke space-less scripts outright: Japanese and Chinese prose butts a mention
 * directly against surrounding text (`よろしく@Erik`), so a Unicode-wide class
 * meant a genuinely picked mention NEVER highlighted for those authors. An email
 * local part is effectively ASCII, so this catches `alice@Erik.com` without
 * touching CJK.
 *
 * Being ASCII also removes the need to read whole code points on this edge: a
 * lone surrogate can never match, which is the same answer a full astral code
 * point would give.
 */
const EMAIL_LOCAL_CHAR = /[A-Za-z0-9._%+-]/;

/**
 * Characters that mean the mention "runs on" into a longer word on the trailing
 * edge. `\p{M}` catches a grapheme ending in a combining mark (NFD `andré`, or
 * Devanagari `मुझे`); `\p{Pc}` covers `_` and its lookalikes.
 *
 * ASCII-only, deliberately, for the same reason as above — see the run-on check
 * below for why the non-ASCII case is handled by name lookup instead.
 */
const RUN_ON_CHAR = /[A-Za-z0-9\p{M}\p{Pc}]/u;

/** Does a longer known display name also start at this position? */
function longerNameStartsHere(
  body: string,
  at: number,
  needleLength: number,
  knownSigners: readonly { id: string; displayName: string }[],
): boolean {
  return knownSigners.some((s) => {
    const other = mentionText(s.displayName);
    return other.length > needleLength && body.startsWith(other, at);
  });
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
      // LEADING EDGE — is this `@` part of an email address? Without this,
      // "@Erik" matches inside `alice@Erik.com`: the `bob!@alice.com` family of
      // false positive this whole design exists to prevent, pinned on the
      // delivery side in tests/server/comments.test.ts and easy to reintroduce
      // on the display side alone.
      if (at > 0 && EMAIL_LOCAL_CHAR.test(body[at - 1])) continue;

      // TRAILING EDGE — does the match stop in the middle of something longer?
      // Picking "Erik" and hand-typing "@Erika Anderson" puts "@Erik" inside text
      // nobody picked; highlighting it slices that text into a styled "@Erik" and
      // a plain remainder, attributing it to the wrong person. Longest-wins below
      // only helps when BOTH names have rows, so this is the case it cannot see.
      //
      // Two separate questions, because one test cannot answer both:
      //
      //   1. Does a longer KNOWN name start here? That is the real risk — the
      //      run-on text is somebody else's name — and it is script-neutral,
      //      which a character class is not.
      //   2. Does an ASCII word character follow? Catches `@Erik_dev`, where the
      //      run-on is a handle rather than a known name.
      //
      // Deliberately NOT "any `\p{L}` follows". That over-rejects exactly the
      // authors a character class cannot serve: `@Erikさん` is the ordinary way
      // to write this in Japanese, and suppressing it means picked mentions never
      // highlight in space-less scripts. Check (1) still protects those authors
      // from mis-attribution, which is the failure that actually matters.
      const next = body.codePointAt(at + needle.length);
      const runsOn =
        next !== undefined && RUN_ON_CHAR.test(String.fromCodePoint(next));
      if (runsOn || longerNameStartsHere(body, at, needle.length, knownSigners)) {
        continue;
      }

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
