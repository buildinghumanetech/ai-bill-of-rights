import { ImageResponse } from "next/og";
import { getSignerById, getSignatureNumber } from "@/lib/db/queries";
import { getActiveSelfieForSigner } from "@/lib/selfie/queries";
import { normalizeWhyISigned } from "@/lib/why-i-signed";

export const runtime = "nodejs";

/**
 * Pick a quote size that fills the panel without overflowing it.
 *
 * ImageResponse/satori has no text-overflow safety net — text that doesn't fit
 * simply spills past the canvas — so the size is chosen from the character
 * count rather than measured. The panel is QUOTE_WIDTH wide and roughly 250px
 * tall; these pairings were checked by rendering at 1, ~60, ~120 and 200 chars.
 */
function quoteStyle(length: number): { fontSize: number; lineHeight: number } {
  if (length <= 60) return { fontSize: 32, lineHeight: 1.32 };
  if (length <= 110) return { fontSize: 27, lineHeight: 1.34 };
  if (length <= 160) return { fontSize: 23, lineHeight: 1.36 };
  return { fontSize: 20, lineHeight: 1.38 };
}

const QUOTE_WIDTH = 456;

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

  // Re-clamp on the way out: rows written before the cap existed (or by any
  // future writer that skips the action) must not be able to blow the layout.
  const quote = normalizeWhyISigned(signer.whyISigned);
  // With a quote the card is a two-column body, so the avatar and name give up
  // some room. Without one, the original single-row layout is kept intact —
  // shrinking it would just leave a differently-shaped hole.
  const avatarSize = quote ? 176 : 200;
  const nameSize = quote ? 40 : 48;
  const { fontSize: quoteFontSize, lineHeight: quoteLineHeight } = quoteStyle(
    quote?.length ?? 0,
  );

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Emerald green banner — top ~40% */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#059669",
            height: 260,
            padding: "36px 60px 56px",
          }}
        >
          <div
            style={{
              fontSize: 20,
              color: "rgba(255,255,255,0.8)",
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            Signer of the
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 700,
              color: "#fff",
              marginTop: 4,
            }}
          >
            AI Bill of Rights
          </div>
          {/* Signer number badge — white pill */}
          <div
            style={{
              display: "flex",
              marginTop: 14,
              padding: "6px 24px",
              background: "rgba(255,255,255,0.2)",
              borderRadius: 9999,
              fontSize: 18,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: 1,
            }}
          >
            {`Signer #${sigNum.toLocaleString()}`}
          </div>
        </div>

        {/* White lower section */}
        <div
          style={{
            display: "flex",
            flex: 1,
            background: "#fff",
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
                  border: "4px solid #fff",
                }}
              />
            ) : (
              <div
                style={{
                  width: avatarSize,
                  height: avatarSize,
                  borderRadius: avatarSize / 2,
                  background: "#d1fae5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: Math.round(avatarSize * 0.4),
                  fontWeight: 700,
                  color: "#059669",
                  border: "4px solid #fff",
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
                fontWeight: 700,
                color: "#111827",
                lineHeight: 1.15,
              }}
            >
              {signer.displayName}
            </div>
            {subtitle ? (
              <div
                style={{
                  fontSize: quote ? 20 : 22,
                  color: "#6b7280",
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
                borderLeft: "5px solid #059669",
                padding: "6px 0 6px 24px",
                marginTop: -14,
              }}
            >
              <div
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  color: "#059669",
                  marginBottom: 10,
                }}
              >
                Why I signed
              </div>
              <div
                style={{
                  fontSize: quoteFontSize,
                  lineHeight: quoteLineHeight,
                  color: "#1f2937",
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
            Join them — sign the AI Bill of Rights
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
