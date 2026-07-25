/**
 * First-party cookies that carry share attribution from arrival to signature.
 *
 * Someone clicks a shared link, reads for ten minutes, wanders through three
 * pages, then signs. The `?ref=` param is long gone from the URL by then, so
 * we stash it in a cookie the moment they land and read it back at signing
 * time (see src/server/actions/sign-from-modal.ts).
 *
 * Two rules the rest of the code depends on:
 *   1. FIRST REF WINS. Whoever actually made the introduction keeps the
 *      credit — a later `?ref=` from a different sharer never overwrites it.
 *   2. Nothing unvalidated is ever stored. Refs must pass `isValidRef`
 *      (a UUID) and channels must be a known `ShareChannel`; anything else is
 *      dropped on the floor rather than written to a cookie or the database.
 *
 * `referralCookiesToSet` is deliberately pure so it can be tested without a
 * request: the proxy hands it the incoming params + existing cookies and just
 * applies whatever comes back.
 */

import {
  isShareChannel,
  isValidRef,
  parseChannel,
  parseRef,
} from "@/lib/share/urls";

/** Who referred this visitor (a signer id). */
export const REF_COOKIE = "abor_ref";
/** Which share surface they arrived from (a ShareChannel). */
export const REF_CHANNEL_COOKIE = "abor_ref_via";

/** 30 days: long enough to cover "I'll read this properly at the weekend". */
export const REF_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface ReferralCookie {
  name: string;
  value: string;
  maxAge: number;
  path: string;
  sameSite: "lax";
  /**
   * httpOnly: nothing in the browser needs to read these — attribution is
   * resolved server-side in the sign action — so keep them off `document.cookie`.
   */
  httpOnly: boolean;
  secure: boolean;
}

type IncomingParams =
  | URLSearchParams
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

export interface ReferralCookieInput {
  /** Query params of the page the visitor just landed on. */
  searchParams: IncomingParams;
  /** Current value of the ref cookie, if the visitor already has one. */
  existingRef?: string | null;
  /** Current value of the channel cookie, if any. */
  existingChannel?: string | null;
  /** Set the Secure flag — true in production, false over plain-HTTP dev. */
  secure?: boolean;
}

function cookie(name: string, value: string, secure: boolean): ReferralCookie {
  return {
    name,
    value,
    maxAge: REF_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure,
  };
}

/**
 * Decide which attribution cookies (if any) this request should set.
 * Returns an empty array for the overwhelmingly common case — no attribution
 * params, or a visitor who is already attributed — so the proxy can skip
 * touching the response entirely.
 */
export function referralCookiesToSet(
  input: ReferralCookieInput,
): ReferralCookie[] {
  const { searchParams, existingRef, existingChannel, secure = false } = input;

  const incomingRef = parseRef(searchParams);
  const incomingChannel = parseChannel(searchParams);
  const alreadyAttributed = isValidRef(existingRef);

  const out: ReferralCookie[] = [];

  if (incomingRef && !alreadyAttributed) {
    // A new introduction. Record it, and record the channel alongside it so
    // the pair always describes the same share event.
    out.push(cookie(REF_COOKIE, incomingRef, secure));
    if (incomingChannel) {
      out.push(cookie(REF_CHANNEL_COOKIE, incomingChannel, secure));
    }
    return out;
  }

  // No ref (or the visitor is already attributed to someone else), but the
  // link still tells us which surface it came from. Worth keeping on its own
  // so channel conversion is comparable even for un-refed shares — same
  // first-touch rule, so a later click can't rewrite the origin story.
  if (incomingChannel && !isShareChannel(existingChannel) && !alreadyAttributed) {
    out.push(cookie(REF_CHANNEL_COOKIE, incomingChannel, secure));
  }

  return out;
}

/** Narrow a raw cookie value to a usable signer id, or null. */
export function readRefCookieValue(raw: unknown): string | null {
  return isValidRef(raw) ? raw : null;
}

/** Narrow a raw cookie value to a known share channel, or null. */
export function readChannelCookieValue(raw: unknown): string | null {
  return isShareChannel(raw) ? raw : null;
}
