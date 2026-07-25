import { ImageResponse } from "next/og";
import {
  assessedCount,
  latestReviewDate,
  listPrinciples,
  loadAllScorecardEntries,
  type ScorecardEntry,
} from "@/lib/scorecard";
import { Banner, FooterCta, OG_SIZE, Shell } from "./card";

export const runtime = "nodejs";

export async function GET() {
  const principles = listPrinciples();

  let real: ScorecardEntry[] = [];
  try {
    real = loadAllScorecardEntries().filter((e) => !e.fictional);
  } catch {
    // Fall through to the zero-state card rather than shipping a broken image.
  }

  const assessed = real.reduce((n, e) => n + assessedCount(e), 0);
  const lastReviewed = latestReviewDate(real);

  const stats = [
    { value: String(principles.length), label: "commitments" },
    { value: String(real.length), label: real.length === 1 ? "company" : "companies" },
    { value: String(assessed), label: "assessments, every one cited" },
  ];

  return new ImageResponse(
    (
      <Shell>
        <Banner
          eyebrow="A People's Demand for Human-Centered AI"
          title="The AI Bill of Rights Scorecard"
          badge={lastReviewed ? `Last reviewed ${lastReviewed}` : null}
        />

        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
            padding: "0 60px",
          }}
        >
          <div
            style={{
              fontSize: 30,
              lineHeight: 1.35,
              color: "#27272a",
            }}
          >
            Where AI companies stand against the nine commitments — with the
            source and the date behind every claim.
          </div>

          <div style={{ display: "flex", marginTop: 36, gap: 56 }}>
            {stats.map((s) => (
              <div
                key={s.label}
                style={{ display: "flex", flexDirection: "column" }}
              >
                <div
                  style={{ fontSize: 60, fontWeight: 700, color: "#059669" }}
                >
                  {s.value}
                </div>
                <div style={{ fontSize: 20, color: "#71717a", marginTop: 2 }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>

        <FooterCta text="ai-for-people.org/scorecard — read the sources yourself" />
      </Shell>
    ),
    OG_SIZE,
  );
}
