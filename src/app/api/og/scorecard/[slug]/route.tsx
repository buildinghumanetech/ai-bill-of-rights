import { ImageResponse } from "next/og";
import { assessedCount, getScorecardEntry } from "@/lib/scorecard";
import { Banner, FooterCta, OG_SIZE, Shell, STATUS_SWATCH } from "../card";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  let entry;
  try {
    entry = getScorecardEntry(slug);
  } catch {
    // A malformed entry must not render a share card that looks authoritative.
    return new Response("Scorecard entry is invalid", { status: 500 });
  }
  if (!entry) return new Response("Scorecard entry not found", { status: 404 });

  const total = entry.assessments.length;
  const assessed = assessedCount(entry);

  return new ImageResponse(
    (
      <Shell>
        <Banner
          eyebrow="AI Bill of Rights Scorecard"
          title={entry.company}
          badge={`${assessed} of ${total} commitments assessed`}
        />

        {entry.fictional ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#fef3c7",
              borderBottom: "2px solid #fcd34d",
              padding: "8px 60px",
              fontSize: 17,
              fontWeight: 700,
              color: "#92400e",
              letterSpacing: 2,
            }}
          >
            EXAMPLE ENTRY — NOT A REAL COMPANY
          </div>
        ) : null}

        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
            padding: "24px 56px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            {entry.assessments.map((a) => {
              const swatch = STATUS_SWATCH[a.status];
              return (
                <div
                  key={a.principle.id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    width: 208,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: swatch.bg,
                    border: `2px solid ${swatch.border}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#71717a",
                      letterSpacing: 1,
                    }}
                  >
                    {`ARTICLE ${a.principle.number}`}
                  </div>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: swatch.fg,
                      marginTop: 2,
                    }}
                  >
                    {swatch.label === "—" ? "Not assessed" : swatch.label}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            style={{
              fontSize: 18,
              color: "#71717a",
              marginTop: 20,
            }}
          >
            {`Every assessment cites a public source. Last reviewed ${entry.lastReviewed}.`}
          </div>
        </div>

        <FooterCta text="ai-for-people.org/scorecard — read the sources yourself" />
      </Shell>
    ),
    OG_SIZE,
  );
}
