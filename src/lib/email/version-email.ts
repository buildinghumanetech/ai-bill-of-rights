/**
 * The email a signer gets about a new version of the Bill: the one-time
 * relaunch email, and every version update after it.
 *
 * House rules for this copy, all enforced by tests/lib/version-email.test.ts:
 *  - It informs; it does not ask anyone to re-sign. Two buttons: "See the
 *    update" (the homepage, tagged ?via=email) and "Spread the word" (a
 *    mailto: draft carrying their own short link, so referrals count).
 *  - Nothing may suggest an earlier signature expired or stopped counting.
 *  - No em dashes.
 *  - Every email carries a one-click unsubscribe link. It's legally required.
 *  - Only the site's palette: white, near-black, gray, blue. No green or purple.
 */

export interface VersionEmailInput {
  /**
   * Their display name. The greeting uses its first word, or greets plainly
   * when that's blank, an initial, masked, or an email address.
   */
  name?: string | null;
  /** Their place in line, from their first signature. Null leaves it out. */
  signerNumber?: number | null;
  /** The version this email is about, e.g. "0.1.0". */
  version: string;
  /**
   * What changed. For the relaunch, a clause that follows "which" ("adds
   * ..."); for a version update, one or two full sentences.
   */
  summary: string;
  relaunch?: boolean;
  /** e.g. "https://theaibill.org" (no trailing slash). */
  siteOrigin: string;
  /**
   * The link their friends get in the "Spread the word" draft: their own
   * theaibill.org/s/<slug>?via=email, or the bare site when they have no slug.
   */
  shareUrl: string;
  unsubscribeUrl: string;
}

export const VERSION_EMAIL_CTA = "See the update";
export const VERSION_EMAIL_SHARE_CTA = "Spread the word";

/** The site's palette, and its font stack with fallbacks for mail clients. */
const INK = "#09090b";
const GRAY = "#71717a";
const BLUE = "#2563eb";
const WHITE = "#ffffff";
const FONT = "Geist, -apple-system, Helvetica, Arial, sans-serif";

/**
 * The name to greet, or null for a plain "Hi,". Takes the first word of the
 * display name, and skips it when it's only an initial ("E", "E."), masked
 * ("E****"), or an email address.
 */
export function greetingName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0] ?? "";
  if (!first || first.includes("@") || first.includes("*")) return null;
  if (first.replace(/\.$/, "").length <= 1) return null;
  return first;
}

export const SHARE_DRAFT_SUBJECT = "I signed The People's AI Bill of Rights";

/**
 * "Spread the word": a draft in the reader's own email app, To left empty.
 * Percent-encoded with encodeURIComponent, not URLSearchParams, because RFC
 * 6068 reads "+" in a mailto as a literal plus (see shareHrefs in
 * src/lib/share/urls.ts).
 */
export function shareDraftHref(shareUrl: string): string {
  const body = `I just added my name to The People's AI Bill of Rights, a people's demand for how AI companies treat us. It takes a minute. Will you sign too? ${shareUrl}`;
  return `mailto:?subject=${encodeURIComponent(SHARE_DRAFT_SUBJECT)}&body=${encodeURIComponent(body)}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface PillSpec {
  label: string;
  href: string;
  /** Solid blue, or white with a blue border and blue text. */
  solid: boolean;
  /** Outlook's VML pill has no auto width; sized for the label in Arial Bold 16px. */
  vmlWidth: number;
}

/**
 * A bulletproof pill button. Everywhere but Outlook on Windows, a table cell
 * carries the color so it survives clients that strip styles from links, and
 * the cell sits in an inline-block, so two buttons sit side by side and wrap
 * to a stack on a narrow screen. Outlook ignores border-radius, so it gets a
 * VML pill of the same size instead (see `pillRow`).
 */
function pill({ label, href, solid }: PillSpec): string {
  const bg = solid ? BLUE : WHITE;
  const fg = solid ? WHITE : BLUE;
  // Both carry a 1.5px border, so the solid and outline pills match in size.
  const link = `display:inline-block;padding:10.5px 22.5px;border:1.5px solid ${BLUE};border-radius:999px;background:${bg};color:${fg};font-family:${FONT};font-size:16px;font-weight:600;line-height:22px;text-decoration:none;white-space:nowrap;`;
  return `<div style="display:inline-block;vertical-align:top;margin:0 12px 12px 0;">
      <table role="presentation" border="0" cellspacing="0" cellpadding="0" style="border-collapse:separate;">
        <tr>
          <td align="center" bgcolor="${bg}" style="background:${bg};border-radius:999px;">
            <a href="${esc(href)}" target="_blank" style="${link}">${esc(label)}</a>
          </td>
        </tr>
      </table>
    </div>`;
}

function vmlPill({ label, href, solid, vmlWidth }: PillSpec): string {
  const bg = solid ? BLUE : WHITE;
  const fg = solid ? WHITE : BLUE;
  return `<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${esc(href)}" style="height:46px;v-text-anchor:middle;width:${vmlWidth}px;" arcsize="50%" strokecolor="${BLUE}" strokeweight="1.5px" fillcolor="${bg}">
        <w:anchorlock/>
        <center style="color:${fg};font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;">${esc(label)}</center>
      </v:roundrect>`;
}

function pillRow(buttons: PillSpec[]): string {
  return `<!--[if mso]>
  <table role="presentation" border="0" cellspacing="0" cellpadding="0"><tr>
    ${buttons.map((b) => `<td style="padding:0 12px 12px 0;">
      ${vmlPill(b)}
    </td>`).join("\n    ")}
  </tr></table>
  <![endif]-->
  <!--[if !mso]><!-->
  <div style="font-size:0;line-height:0;">
    ${buttons.map(pill).join("\n    ")}
  </div>
  <!--<![endif]-->`;
}

export function versionEmail(opts: VersionEmailInput): {
  subject: string;
  text: string;
  html: string;
} {
  const firstName = greetingName(opts.name);
  // The homepage, tagged so visits from this email can be told apart.
  const homeUrl = `${opts.siteOrigin}/?via=email`;
  const siteHost = opts.siteOrigin.replace(/^https?:\/\//, "");

  const subject = `We've updated The People's AI Bill of Rights: v${opts.version}`;
  const shareHref = shareDraftHref(opts.shareUrl);

  const hi = firstName ? `Hi ${firstName},` : "Hi,";
  const paragraphs = [
    opts.signerNumber
      ? `${hi} thanks for being signer #${opts.signerNumber.toLocaleString("en-US")} on The People's AI Bill of Rights.`
      : `${hi} thanks for signing The People's AI Bill of Rights.`,
    opts.relaunch
      ? `You asked to hear about updates. We've created v${opts.version}, which ${opts.summary}`
      : `You asked to hear about updates. We've created v${opts.version}. ${opts.summary}`,
  ];
  // The relaunch also announces the move to the new domain.
  const newHome = opts.relaunch ? `We also have a new home: ${siteHost}.` : null;
  const footer =
    "You're getting this because you signed The People's AI Bill of Rights and asked to hear about new versions.";

  const text = [
    ...paragraphs,
    ...(newHome ? [newHome] : []),
    `${VERSION_EMAIL_CTA}:\n${homeUrl}`,
    `${VERSION_EMAIL_SHARE_CTA}:\n${shareHref}`,
    "Thanks!\nErika",
    `${footer}\nUnsubscribe: ${opts.unsubscribeUrl}`,
  ].join("\n\n");

  const p = (s: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${INK};">${s}</p>`;
  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:${WHITE};font-family:${FONT};">
<div style="max-width:560px;margin:0 auto;padding:32px 24px;">
  ${paragraphs.map((s) => p(esc(s))).join("\n  ")}
  ${newHome ? p(`We also have a new home: <a href="${esc(homeUrl)}" style="color:${BLUE};text-decoration:underline;">${esc(siteHost)}</a>.`) : ""}
  <div style="margin:24px 0 12px;">
  ${pillRow([
    { label: VERSION_EMAIL_CTA, href: homeUrl, solid: true, vmlWidth: 170 },
    { label: VERSION_EMAIL_SHARE_CTA, href: shareHref, solid: false, vmlWidth: 186 },
  ])}
  </div>
  ${p("Thanks!<br>Erika")}
  <p style="margin:32px 0 0;font-size:13px;line-height:1.5;color:${GRAY};">${esc(footer)} <a href="${esc(opts.unsubscribeUrl)}" style="color:${GRAY};text-decoration:underline;">Unsubscribe</a>.</p>
</div>
</body>
</html>`;

  return { subject, text, html };
}
