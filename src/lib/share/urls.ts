/**
 * Canonical builders for every outbound share link on the site.
 *
 * Two params ride along on every share URL:
 *   ?ref=<signerId>  — who sent it, so we can attribute the resulting signature
 *   ?via=<channel>   — which surface it was shared from, so we can compare
 *                      conversion across X / LinkedIn / email / copied link
 *
 * Everything funnels through here so attribution can never silently drop off a
 * link: if a share button doesn't use these helpers, it isn't tracked.
 */

export const REF_PARAM = "ref";
export const CHANNEL_PARAM = "via";

export const SHARE_CHANNELS = [
  "x",
  "linkedin",
  "email",
  "copy",
  "qr",
  "invite",
  "confirmation-email",
] as const;

export type ShareChannel = (typeof SHARE_CHANNELS)[number];

export function isShareChannel(value: unknown): value is ShareChannel {
  return (
    typeof value === "string" &&
    (SHARE_CHANNELS as readonly string[]).includes(value)
  );
}

/** UUIDs are the only thing we ever accept as a referrer id. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidRef(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export interface ShareParams {
  /** Signer id of the person doing the sharing. */
  ref?: string | null;
  /** Which share surface the link came from. */
  channel?: ShareChannel | null;
}

/**
 * Set the attribution params on a URL.
 *
 * Semantics, keyed on whether the caller *mentions* a param at all:
 *
 *   - key absent from `params`  → whatever is on the URL is left untouched.
 *     The caller isn't expressing an opinion about it.
 *   - key present and valid     → replaces any existing value.
 *   - key present but invalid   → the existing value is REMOVED, not kept.
 *     A caller who says "attribute this to X" and supplies a broken X must
 *     not silently ship a link crediting whoever happened to be there before
 *     — that credits someone for a share they did not make. Pass `null` to
 *     deliberately strip attribution.
 *
 * Values replace rather than stack. A signer who lands on `/?ref=A&via=x`,
 * copies the address bar and shares would otherwise produce `?ref=A&...&ref=B`;
 * since `parseRef` reads the FIRST value, B would be silently dropped and A
 * credited twice — the exact failure this module exists to prevent.
 *
 * Only the two attribution params are rewritten. Every other param keeps its
 * original bytes, because re-serialising the query through `URLSearchParams`
 * applies form-encoding rules to params we were never asked to touch: `%20`
 * becomes `+` and `~` becomes `%7E`. That is actively wrong for `mailto:`
 * links, where RFC 6068 reads `+` as a literal plus — a shared mail draft
 * would arrive reading "I+just+signed".
 */
export function withShareParams(url: string, params: ShareParams = {}): string {
  const setsRef = "ref" in params;
  const setsChannel = "channel" in params;
  if (!setsRef && !setsChannel) return url;

  const ref = isValidRef(params.ref) ? params.ref : null;
  const channel = isShareChannel(params.channel) ? params.channel : null;

  const [base, hash = ""] = splitHash(url);
  const qIndex = base.indexOf("?");
  const path = qIndex === -1 ? base : base.slice(0, qIndex);
  const rawQuery = qIndex === -1 ? "" : base.slice(qIndex + 1);

  // Split on & and drop the pairs we own, comparing only the key so the
  // untouched pairs are carried through verbatim.
  const kept = rawQuery
    .split("&")
    .filter((pair) => pair.length > 0)
    .filter((pair) => {
      const key = pair.split("=")[0];
      if (setsRef && key === REF_PARAM) return false;
      if (setsChannel && key === CHANNEL_PARAM) return false;
      return true;
    });

  if (ref) kept.push(`${REF_PARAM}=${encodeURIComponent(ref)}`);
  if (channel) kept.push(`${CHANNEL_PARAM}=${encodeURIComponent(channel)}`);

  const qs = kept.join("&");
  return `${path}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`;
}

/** The subject line on every `mailto:` share, so both surfaces say the same thing. */
export const SHARE_EMAIL_SUBJECT = "Sign the AI Bill of Rights";

export interface ShareHrefs {
  twitterHref: string;
  linkedinHref: string;
  emailHref: string;
}

/**
 * The three outbound share hrefs — X, LinkedIn, `mailto:` — built once.
 *
 * The post-signature modal and the confirmation email render the same three
 * buttons, and they had drifted into two verbatim copies of this construction.
 * A copy is a place for one of them to lose its `?ref=`/`?via=` quietly, and
 * for the `mailto:` encoding below to be "tidied up" on one side only.
 *
 * `url` and `text` are per-channel resolvers rather than plain strings so each
 * href carries its own `?via=` and its own copy: the caller decides how a URL
 * is tagged, this decides how the three links are assembled.
 *
 * The body is percent-encoded with `encodeURIComponent`, NOT re-serialised
 * through `URLSearchParams`. RFC 6068 reads `+` in a mailto as a literal plus,
 * so form-encoding would make a shared draft arrive reading "I+just+signed".
 */
export function shareHrefs(opts: {
  /** The share target, per channel — normally `withShareParams`/`signerShareUrl`. */
  url: (channel: ShareChannel) => string;
  /** The share copy, per channel. */
  text: (channel: ShareChannel) => string;
}): ShareHrefs {
  const { url, text } = opts;
  return {
    twitterHref: `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      text("x"),
    )}&url=${encodeURIComponent(url("x"))}`,
    // LinkedIn's share-offsite endpoint takes no text — the copy travels with
    // the OG card, which is why the quote also renders into the image.
    linkedinHref: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
      url("linkedin"),
    )}`,
    emailHref: `mailto:?subject=${encodeURIComponent(
      SHARE_EMAIL_SUBJECT,
    )}&body=${encodeURIComponent(`${text("email")}\n\n${url("email")}`)}`,
  };
}

function splitHash(url: string): [string, string] {
  const i = url.indexOf("#");
  if (i === -1) return [url, ""];
  return [url.slice(0, i), url.slice(i + 1)];
}

function trimSlash(siteUrl: string): string {
  return siteUrl.replace(/\/+$/, "");
}

/** A signer's public page, carrying their own id as the referrer. */
export function signerShareUrl(
  siteUrl: string,
  signerId: string,
  channel?: ShareChannel,
): string {
  return withShareParams(`${trimSlash(siteUrl)}/signatories/${signerId}`, {
    ref: signerId,
    channel,
  });
}

/** The homepage, attributed to whoever shared it. */
export function homeShareUrl(
  siteUrl: string,
  ref?: string | null,
  channel?: ShareChannel,
): string {
  return withShareParams(`${trimSlash(siteUrl)}/`, { ref, channel });
}

/**
 * Pull a referrer id out of an incoming request's query params.
 * Accepts Next's `searchParams` shape (string | string[] | undefined).
 */
export function parseRef(
  searchParams:
    | Record<string, string | string[] | undefined>
    | URLSearchParams
    | null
    | undefined,
): string | null {
  if (!searchParams) return null;
  const raw =
    searchParams instanceof URLSearchParams
      ? searchParams.get(REF_PARAM)
      : searchParams[REF_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isValidRef(value) ? value : null;
}

export function parseChannel(
  searchParams:
    | Record<string, string | string[] | undefined>
    | URLSearchParams
    | null
    | undefined,
): ShareChannel | null {
  if (!searchParams) return null;
  const raw =
    searchParams instanceof URLSearchParams
      ? searchParams.get(CHANNEL_PARAM)
      : searchParams[CHANNEL_PARAM];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isShareChannel(value) ? value : null;
}
