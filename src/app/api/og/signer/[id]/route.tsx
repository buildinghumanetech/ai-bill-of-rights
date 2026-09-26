import { ImageResponse } from "next/og";
import { getSignerById, getSignatureNumber } from "@/lib/db/queries";
import { getActiveSelfieForSigner } from "@/lib/selfie/queries";
import { QUOTE_WIDTH, signerCardQuote } from "@/lib/og/signer-quote";
import { OG_COLORS as C, OG_TAG, loadGeist } from "../../style";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [signer, sigNum] = await Promise.all([
    getSignerById(id),
    getSignatureNumber(id),
  ]);
  if (!signer) {
    return new Response("Signer not found", { status: 404 });
  }
  const selfie = await getActiveSelfieForSigner(id);
  const initial = signer.displayName.trim().charAt(0).toUpperCase() || "?";

  const subtitle =
    signer.affiliation || signer.locationText
      ? [signer.affiliation, signer.locationText].filter(Boolean).join(" · ")
      : null;

  // Sanitising, clamping and sizing all happen in signerCardQuote — see the
  // note there about why they are not inline in this route.
  const {
    text: quote,
    fontSize: quoteFontSize,
    lineHeight: quoteLineHeight,
  } = signerCardQuote(signer.whyISigned);
  // With a quote the card is a two-column body, so the avatar and name give up
  // some room. Without one, the original single-row layout is kept intact —
  // shrinking it would just leave a differently-shaped hole.
  const avatarSize = quote ? 176 : 200;
  const nameSize = quote ? 40 : 48;
  const fonts = await loadGeist();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Geist",
          position: "relative",
        }}
      >
        {/* Light gray band: the site's tag, then "I signed." and their number. */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: C.band,
            borderBottom: `1px solid ${C.bandBorder}`,
            height: 260,
            padding: "36px 60px 56px",
          }}
        >
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: C.tag,
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            {OG_TAG}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 56,
              fontWeight: 600,
              letterSpacing: -1,
              marginTop: 12,
            }}
          >
            <span style={{ color: C.ink }}>I signed.</span>
            <span style={{ color: C.blue, marginLeft: 16 }}>
              {`Signer #${sigNum.toLocaleString()}`}
            </span>
          </div>
        </div>

        {/* White lower section */}
        <div
          style={{
            display: "flex",
            flex: 1,
            background: C.white,
            padding: quote ? "0 56px 30px" : "0 60px 36px",
            alignItems: "center",
            gap: quote ? 32 : 40,
          }}
        >
          {/* Avatar — positioned to overlap the banner/white boundary */}
          <div
            style={{
              display: "flex",
              marginTop: quote ? -52 : -60,
              flexShrink: 0,
            }}
          >
            {selfie ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selfie.displayBlobUrl}
                alt=""
                width={avatarSize}
                height={avatarSize}
                style={{
                  width: avatarSize,
                  height: avatarSize,
                  borderRadius: avatarSize / 2,
                  objectFit: "cover",
                  border: `4px solid ${C.white}`,
                }}
              />
            ) : (
              <div
                style={{
                  width: avatarSize,
                  height: avatarSize,
                  borderRadius: avatarSize / 2,
                  background: C.blueTint,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: Math.round(avatarSize * 0.4),
                  fontWeight: 600,
                  color: C.blue,
                  border: `4px solid ${C.white}`,
                }}
              >
                {initial}
              </div>
            )}
          </div>

          {/* Name + subtitle */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              flex: 1,
              minWidth: 0,
              marginTop: quote ? -14 : -20,
            }}
          >
            <div
              style={{
                fontSize: nameSize,
                fontWeight: 600,
                color: C.ink,
                lineHeight: 1.15,
              }}
            >
              {signer.displayName}
            </div>
            {subtitle ? (
              <div
                style={{
                  fontSize: quote ? 20 : 22,
                  color: C.muted,
                  marginTop: 6,
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>

          {/* Their own words — the reason this card is worth sharing. */}
          {quote ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                width: QUOTE_WIDTH,
                flexShrink: 0,
                borderLeft: `5px solid ${C.blue}`,
                padding: "6px 0 6px 24px",
                marginTop: -14,
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: C.blue,
                  marginBottom: 10,
                }}
              >
                Why I signed
              </div>
              <div
                style={{
                  fontSize: quoteFontSize,
                  lineHeight: quoteLineHeight,
                  color: C.body,
                }}
              >
                {`“${quote}”`}
              </div>
            </div>
          ) : null}
        </div>

        {/* Amber accent bar at the bottom */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#fffbeb",
            borderTop: "2px solid #fde68a",
            padding: "14px 60px",
          }}
        >
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "#92400e",
            }}
          >
            Join them. Sign at theaibill.org
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, fonts },
  );
}
