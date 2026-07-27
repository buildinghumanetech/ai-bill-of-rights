/**
 * Write-time mention resolution.
 *
 * `parseMentions` (see `./mentions.ts`) infers *who* an author meant by reading
 * their prose after the fact. That inference has no well-defined answer — six
 * consecutive review rounds each found another body where it emailed the wrong
 * signer, because a bare `@` in a URL or an email address is indistinguishable
 * from a mention without guessing.
 *
 * This module removes the guess. When the author picks a name from the composer
 * typeahead we already know the exact `signerId`; we keep it and submit it with
 * the comment. The server then notifies *that* signer and nobody else.
 *
 * Two functions, both pure and both deliberately using exact string containment
 * rather than pattern matching:
 *
 * - `pruneResolvedMentions` runs in the composer. The author can edit or delete
 *   text after picking a name, so a pick only survives while the exact text we
 *   inserted for it is still present.
 * - `resolveSubmittedMentions` runs on the server, and is the *only* source of
 *   mention notifications. Ids arrive from the browser
 *   and therefore cannot be trusted: it drops ids that aren't real signers, and
 *   drops any signer whose `@DisplayName` does not literally appear in the body.
 *   Without that second check a crafted request could notify any signer with any
 *   body — the whole point is that a notification requires the name to be there.
 *
 * Known limitation, deliberate: containment can *over-keep* a pick when one
 * display name is a prefix of another. Pick "Erik", then hand-edit the text into
 * "@Erika Anderson", and Erik stays resolved because "@Erik" is still literally
 * present. The composer shows "Notifying @Erik" throughout, so it is visible
 * rather than silent — and the property that matters still holds: a notification
 * can only ever reach someone the author explicitly picked. The old parse path
 * had the opposite, worse failure, notifying a signer who was never chosen.
 */

export interface ResolvedMention {
  signerId: string;
  /** The display name as inserted, so the body can be checked for it verbatim. */
  displayName: string;
}

interface KnownSigner {
  id: string;
  displayName: string;
}

/**
 * The exact text the composer inserts for a pick. Both sides derive the needle
 * from this one function so they can never disagree about what to look for.
 */
export function mentionText(displayName: string): string {
  return `@${displayName}`;
}

/**
 * Is this pick's inserted text still in the body?
 *
 * Plain `includes` — no regex, so a display name containing regex metacharacters
 * ("A. (Bob) Smith+") needs no escaping and cannot change the match semantics.
 * No trailing-boundary check is needed either: we are not asking "does some name
 * start here", we are asking "is the text we wrote still here". `@Erik` does not
 * survive as a pick just because the author later typed `@Erika`, because the
 * pick for Erik carries Erik's own id and is only kept when `@Erik` is present —
 * and if both names are present, both signers were genuinely picked.
 */
function bodyContainsMention(body: string, displayName: string): boolean {
  return body.includes(mentionText(displayName));
}

/** Drop duplicate signer ids, keeping first-picked order. */
function dedupeBySignerId(mentions: ResolvedMention[]): ResolvedMention[] {
  const seen = new Set<string>();
  const out: ResolvedMention[] = [];
  for (const m of mentions) {
    if (seen.has(m.signerId)) continue;
    seen.add(m.signerId);
    out.push(m);
  }
  return out;
}

/**
 * Composer-side: keep only the picks whose inserted text survives in `body`.
 *
 * Called on every keystroke, so an author who picks "Alice" and then deletes the
 * mention stops notifying her — and one who retypes it by hand does *not* start
 * notifying her again, because the pick is gone. That asymmetry is intentional:
 * a notification always traces back to an explicit pick.
 */
export function pruneResolvedMentions(
  body: string,
  picks: readonly ResolvedMention[],
): ResolvedMention[] {
  return dedupeBySignerId(
    picks.filter((p) => bodyContainsMention(body, p.displayName)),
  );
}

/**
 * The form fields carrying resolution across the wire. Kept here, next to the
 * functions that read and write them, so a composer and the server action cannot
 * drift apart on a field name.
 */
export const MENTION_IDS_FIELD = "mentionSignerIds";
export const MENTION_SOURCE_FIELD = "mentionSource";
export const MENTION_SOURCE_COMPOSER = "composer";

/**
 * Composer-side: attach the resolved ids to a submission.
 *
 * The marker is set even when there are no mentions, so the server can tell "this
 * client resolved and found none" from "this submission carried no resolution at
 * all" — the latter is logged as a warning, since every real composer sets it.
 */
export function appendResolvedMentions(
  fd: FormData,
  mentions: readonly ResolvedMention[],
): void {
  fd.set(MENTION_SOURCE_FIELD, MENTION_SOURCE_COMPOSER);
  for (const m of mentions) fd.append(MENTION_IDS_FIELD, m.signerId);
}

/**
 * Server-side counterpart to `appendResolvedMentions`.
 *
 * `fromComposer: false` means the submission carried no resolution. There is no
 * prose-parsing fallback: a fallback the client selects by simply omitting a
 * field would be an opt-out from every guarantee below, so the caller notifies
 * nobody instead.
 */
export function readSubmittedMentions(fd: FormData): {
  fromComposer: boolean;
  signerIds: string[];
} {
  const fromComposer =
    fd.get(MENTION_SOURCE_FIELD)?.toString() === MENTION_SOURCE_COMPOSER;
  const signerIds = fd
    .getAll(MENTION_IDS_FIELD)
    .map((v) => v.toString())
    .filter((v) => v.length > 0);
  return { fromComposer, signerIds };
}

/**
 * Server-side: turn submitted ids into the signers to notify.
 *
 * An id must (a) belong to a real, mentionable signer and (b) have its
 * `@DisplayName` present in the stored body. (b) is what makes a forged request
 * useless: to notify a signer you must put their name in the comment, which is
 * exactly the visible, auditable thing a mention is supposed to be.
 *
 * Note this reads the display name from `knownSigners`, never from the client —
 * a request can choose *which* signer to check, not what text to check for.
 */
export function resolveSubmittedMentions(
  body: string,
  submittedSignerIds: readonly string[],
  knownSigners: readonly KnownSigner[],
): ResolvedMention[] {
  const byId = new Map(knownSigners.map((s) => [s.id, s]));
  const resolved: ResolvedMention[] = [];
  for (const id of submittedSignerIds) {
    const signer = byId.get(id);
    if (!signer) continue;
    if (!bodyContainsMention(body, signer.displayName)) continue;
    resolved.push({ signerId: signer.id, displayName: signer.displayName });
  }
  return dedupeBySignerId(resolved);
}
