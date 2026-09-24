/**
 * Reading the visitor's share attribution back off the current request.
 *
 * Deliberately a plain module, NOT `"use server"`: every export of a
 * `"use server"` file is a POST-reachable Server Function. This one only reads
 * the caller's own cookies, but it has no business being callable from the
 * browser, and keeping it here lets every signer-creating action share one
 * implementation — `recordSignatureFromModal` / `createSignerFromModal`
 * (src/server/actions/sign-from-modal.ts) and `submitProfileAction`
 * (src/server/actions/profile.ts, behind /sign/profile).
 */

import { cookies } from "next/headers";
import {
  REF_CHANNEL_COOKIE,
  REF_COOKIE,
  readChannelCookieValue,
  readRefCookieValue,
} from "@/lib/referral/cookie";

/** What the proxy stamped on this visitor when they first arrived. */
export interface ReferralAttribution {
  /** Signer id of whoever introduced them, if anyone. */
  ref: string | null;
  /** The `?via=` surface that introduction came from, if it carried one. */
  channel: string | null;
}

const UNATTRIBUTED: ReferralAttribution = { ref: null, channel: null };

/**
 * Read the attribution cookies the proxy stamped on arrival. Best effort by
 * design: if the cookie jar is unavailable or holds junk we return nulls and
 * the signature proceeds unattributed. A signature is never worth losing over
 * a referral credit.
 *
 * Both cookies are read from the same jar in one go, because the pair always
 * describes the same share event — reading them separately would let a retry
 * pick up a ref from one moment and a channel from another.
 */
export async function readReferralAttribution(): Promise<ReferralAttribution> {
  try {
    const jar = await cookies();
    return {
      ref: readRefCookieValue(jar.get(REF_COOKIE)?.value),
      channel: readChannelCookieValue(jar.get(REF_CHANNEL_COOKIE)?.value),
    };
  } catch (err) {
    console.warn("[referral] could not read attribution cookies:", err);
    return UNATTRIBUTED;
  }
}
