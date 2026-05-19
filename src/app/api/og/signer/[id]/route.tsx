import { ImageResponse } from "next/og";
import { getSignerById } from "@/lib/db/queries";
import { getActiveSelfieForSigner } from "@/lib/selfie/queries";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const signer = await getSignerById(id);
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
          background: "white",
          padding: 60,
          gap: 48,
          alignItems: "center",
          fontFamily: "sans-serif",
        }}
      >
        {selfie ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selfie.displayBlobUrl}
            alt=""
            width={360}
            height={360}
            style={{
              width: 360,
              height: 360,
              borderRadius: 24,
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: 360,
              height: 360,
              borderRadius: 24,
              background: "#f4f4f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 160,
              fontWeight: 700,
              color: "#71717a",
            }}
          >
            {initial}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div
            style={{
              fontSize: 22,
              color: "#52525b",
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            Signer of the
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              color: "#09090b",
              marginTop: 8,
            }}
          >
            AI Bill of Rights
          </div>
          <div style={{ fontSize: 48, color: "#27272a", marginTop: 24 }}>
            {signer.displayName}
          </div>
          {subtitle ? (
            <div style={{ fontSize: 24, color: "#71717a", marginTop: 8 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
