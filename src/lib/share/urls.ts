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
 * Set attribution params on an absolute URL. Invalid refs are dropped rather
 * than propagated, so a malformed id can never poison a share link.
 *
 * These params REPLACE any already on the URL, they don't stack. That matters:
 * a signer who lands on `/?ref=A&via=x`, copies the address bar, and shares it
 * would otherwise produce `?ref=A&...&ref=B`. Since `parseRef` reads the FIRST
 * value, B's attribution would be silently dropped and A credited twice — the
 * exact failure this module exists to prevent.
 */
export function withShareParams(url: string, params: ShareParams = {}): string {
  const { ref, channel } = params;
  const hasRef = isValidRef(ref);
  const hasChannel = isShareChannel(channel);
  if (!hasRef && !hasChannel) return url;

  const [base, hash = ""] = splitHash(url);
  const qIndex = base.indexOf("?");
  const path = qIndex === -1 ? base : base.slice(0, qIndex);
  const query = new URLSearchParams(qIndex === -1 ? "" : base.slice(qIndex + 1));

  // `set` overwrites every existing occurrence rather than appending.
  if (hasRef) query.set(REF_PARAM, ref);
  if (hasChannel) query.set(CHANNEL_PARAM, channel);

  const qs = query.toString();
  return `${path}${qs ? `?${qs}` : ""}${hash ? `#${hash}` : ""}`;
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
