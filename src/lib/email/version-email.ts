/**
 * The email a signer gets about a new version of the Bill: the one-time
 * relaunch email, and every version update after it.
 *
 * House rules for this copy, all enforced by tests/lib/version-email.test.ts:
 *  - It informs; it does not ask anyone to re-sign. One call to action, the
 *    "See the update" button, with the same link in plain text under it.
 *  - Nothing may suggest an earlier signature expired or stopped counting.
 *  - No em dashes. Dates written out ("Friday, July 24th").
 *  - Every email carries a one-click unsubscribe link.
 *  - Only the site's palette: white, near-black, gray, blue. No green or purple.
 */

export interface VersionEmailInput {
  /** Real first name, never a masked display name. Blank greets plainly. */
  firstName?: string | null;
  /** Their place in line, from their first signature. Null leaves it out. */
  signerNumber?: number | null;
  /** The version this email is about, e.g. "0.1.0". */
  version: string;
  /** ISO date it was published, e.g. "2026-07-24". */
  publishedAt: string;
  /** One or two plain sentences on what changed. */
  summary: string;
  /** The version they signed, when it's an earlier one. */
  signedVersion?: string | null;
  /** The relaunch email also announces the site's new home. */
  relaunch?: boolean;
  /** e.g. "https://theaibill.org" (no trailing slash). */
  siteOrigin: string;
  unsubscribeUrl: string;
}

export const VERSION_EMAIL_CTA = "See the update";

/** The site's palette, and its font stack with fallbacks for mail clients. */
const INK = "#09090b";
const GRAY = "#71717a";
const BLUE = "#2563eb";
const FONT = "Geist, -apple-system, Helvetica, Arial, sans-serif";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
}

/** "2026-07-24" → "Friday, July 24th". Read as a calendar date, not a moment. */
export function longDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${WEEKDAYS[date.getUTCDay()]}, ${MONTHS[m - 1]} ${ordinal(d)}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function versionEmail(opts: VersionEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const firstName = opts.firstName?.trim().split(/\s+/)[0] ?? "";
  const whatChangedUrl = `${opts.siteOrigin}/v/${opts.version}#what-changed`;
  const siteHost = opts.siteOrigin.replace(/^https?:\/\//, "");

  const subject = opts.relaunch
    ? "A new version of The People's AI Bill of Rights"
    : `Version ${opts.version} of The People's AI Bill of Rights is out`;

  const paragraphs: string[] = [];
  paragraphs.push(
    opts.signerNumber
      ? `Thank you for signing The People's AI Bill of Rights. You're signer #${opts.signerNumber.toLocaleString("en-US")}.`
      : "Thank you for signing The People's AI Bill of Rights.",
  );
  paragraphs.push(
    `On ${longDate(opts.publishedAt)}, we published a new version, v${opts.version}. ${opts.summary}`,
  );
  if (opts.signedVersion) {
    paragraphs.push(
      `Your signature on v${opts.signedVersion} stands, and you're still counted.`,
    );
  }
  const closing = opts.relaunch
    ? `The site has a new home too: ${siteHost}.`
    : null;
  const footer =
    "You're getting this because you signed The People's AI Bill of Rights and asked to hear about new versions.";

  const text = [
    firstName ? `Hi ${firstName},` : "Hi,",
    ...paragraphs,
    `${VERSION_EMAIL_CTA}:\n${whatChangedUrl}`,
    ...(closing ? [closing] : []),
    "Erika Anderson",
    `${footer}\nUnsubscribe: ${opts.unsubscribeUrl}`,
  ].join("\n\n");

  const p = (s: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${INK};">${s}</p>`;
  const href = esc(whatChangedUrl);
  // A bulletproof button: a table cell carries the color, so it survives
  // clients that strip styles from links. Outlook on Windows ignores
  // border-radius, so it gets a VML pill of the same size instead.
  const button = `<!--[if mso]>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:46px;v-text-anchor:middle;width:170px;" arcsize="50%" stroke="f" fillcolor="${BLUE}">
    <w:anchorlock/>
    <center style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;">${esc(VERSION_EMAIL_CTA)}</center>
  </v:roundrect>
  <![endif]-->
  <!--[if !mso]><!-->
  <table role="presentation" border="0" cellspacing="0" cellpadding="0" align="left" style="border-collapse:separate;">
    <tr>
      <td align="center" bgcolor="${BLUE}" style="background:${BLUE};border-radius:999px;">
        <a href="${href}" target="_blank" style="display:inline-block;padding:12px 24px;border-radius:999px;background:${BLUE};color:#ffffff;font-family:${FONT};font-size:16px;font-weight:600;line-height:22px;text-decoration:none;">${esc(VERSION_EMAIL_CTA)}</a>
      </td>
    </tr>
  </table>
  <!--<![endif]-->`;
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#ffffff;font-family:${FONT};">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
  ${p(esc(firstName ? `Hi ${firstName},` : "Hi,"))}
  ${paragraphs.map((s) => p(esc(s))).join("\n  ")}
  <div style="margin:24px 0 8px;">
  ${button}
  </div>
  <div style="clear:both;"></div>
  <p style="margin:0 0 24px;font-size:13px;line-height:1.5;color:${GRAY};"><a href="${href}" style="color:${GRAY};text-decoration:underline;word-break:break-all;">${href}</a></p>
  ${closing ? p(esc(closing)) : ""}
  ${p("Erika Anderson")}
  <p style="margin:32px 0 0;font-size:13px;line-height:1.5;color:${GRAY};">${esc(footer)} <a href="${esc(opts.unsubscribeUrl)}" style="color:${GRAY};text-decoration:underline;">Unsubscribe</a>.</p>
</div>
</body>
</html>`;

  return { subject, text, html };
}
