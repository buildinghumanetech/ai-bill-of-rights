/**
 * The funnel, named once.
 *
 * These are the only event names the site emits. Keeping them in one const —
 * rather than as string literals sprinkled through components — is what makes
 * the dashboard readable six months from now, and what lets us swap Vercel
 * Analytics for something else by rewriting a single file.
 *
 * The funnel this describes, in order:
 *
 *   share_link_landed   someone arrived on a link that carried ?ref / ?via
 *   sign_modal_opened   they opened the sign modal
 *   sign_form_submitted they submitted name + contact
 *   signature_completed the signature is in the database
 *   share_clicked       they shared it onward (pre- or post-sign)
 *
 * Drop-off between any two consecutive steps is the number worth arguing
 * about; `channel` on the first and last steps is what makes X, LinkedIn and
 * email invites comparable.
 */

export const ANALYTICS_EVENTS = {
  shareLinkLanded: "share_link_landed",
  signModalOpened: "sign_modal_opened",
  signFormSubmitted: "sign_form_submitted",
  signatureCompleted: "signature_completed",
  shareClicked: "share_clicked",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/** Vercel Analytics only accepts flat, primitive property values. */
export type AnalyticsValue = string | number | boolean | null | undefined;
export type AnalyticsProps = Record<string, AnalyticsValue>;
