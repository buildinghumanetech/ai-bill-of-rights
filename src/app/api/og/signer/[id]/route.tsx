import { ImageResponse } from "next/og";
import { getSignerById, getSignatureNumber } from "@/lib/db/queries";
import { getActiveSelfieForSigner } from "@/lib/selfie/queries";

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
            padding: "0 60px 36px",
            alignItems: "center",
            gap: 40,
          }}
        >
          {/* Avatar — positioned to overlap the banner/white boundary */}
          <div
            style={{
              display: "flex",
              marginTop: -60,
              flexShrink: 0,
            }}
          >
            {selfie ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selfie.displayBlobUrl}
                alt=""
                width={200}
                height={200}
                style={{
                  width: 200,
                  height: 200,
                  borderRadius: 100,
                  objectFit: "cover",
                  border: "4px solid #fff",
                }}
              />
            ) : (
              <div
                style={{
                  width: 200,
                  height: 200,
                  borderRadius: 100,
                  background: "#d1fae5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 80,
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
              marginTop: -20,
            }}
          >
            <div
              style={{
                fontSize: 48,
                fontWeight: 700,
                color: "#111827",
              }}
            >
              {signer.displayName}
            </div>
            {subtitle ? (
              <div
                style={{
                  fontSize: 22,
                  color: "#6b7280",
                  marginTop: 6,
                }}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
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
