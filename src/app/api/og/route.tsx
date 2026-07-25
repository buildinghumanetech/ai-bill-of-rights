import { ImageResponse } from "next/og";
import { getSignatureCount } from "@/lib/db/queries";

export const runtime = "nodejs";

/**
 * Homepage social share card (1200x630).
 *
 * Same three-zone family as the per-signer card in
 * `src/app/api/og/signer/[id]/route.tsx` — emerald banner / white body / amber
 * CTA footer — but this one has to stand on its own for a stranger who has
 * never heard of the document. So the body carries the nine article titles:
 * they are the whole pitch, readable at a glance in a feed.
 */

/**
 * Short forms of the nine articles — the full headings are far too long to fit
 * a 3x3 grid on a 1200x630 card ("You Have the Right to Know You're Talking to
 * a Machine" is one cell).
 *
 * These are hand-written paraphrases, NOT derived from the markdown, because
 * the real headings can't be mechanically shortened. That makes them a drift
 * risk: the Bill of Rights is a living, versioned document, so an edit to
 * `content/bill-of-rights/` would leave this card silently stale. The guard
 * against that is `tests/app/og-articles-drift.test.ts`, which parses the
 * current version's markdown and fails if the article count or their order no
 * longer lines up with this list. If that test fails, update these strings.
 */
export const ARTICLES = [
  "Your data belongs to you",
  "Your memory is portable",
  "Know when it's a machine",
  "No manipulation against you",
  "A right to an explanation",
  "A right to human contact",
  "Children are not a market",
  "Builders are accountable",
  "Your attention is yours",
] as const;

/**
 * At ~90 signatures a bare count reads as counter-proof, so we never print the
 * raw number below 1,000 — we frame the smallness as the reason to act. Past
 * 1,000 the number itself is the social proof and we lead with it.
 */
function ctaLine(count: number | null): string {
  if (count !== null && count >= 1000) {
    return `Join ${count.toLocaleString()} people who have signed — ai-for-people.org`;
  }
  return "Be one of the first 1,000 to sign — ai-for-people.org";
}

export async function GET() {
  // A DB hiccup must never break unfurls everywhere, so degrade to the static
  // card rather than 500-ing.
  let count: number | null = null;
  try {
    count = await getSignatureCount();
  } catch (err) {
    console.error("[api/og] getSignatureCount failed; static card:", err);
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          fontFamily: "sans-serif",
          background: "#fff",
        }}
      >
        {/* Emerald banner */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#059669",
            height: 208,
            padding: "0 60px",
          }}
        >
          <div
            style={{
              fontSize: 18,
              color: "rgba(255,255,255,0.82)",
              letterSpacing: 4,
              textTransform: "uppercase",
            }}
          >
            A People&apos;s Demand for Human-Centered AI
          </div>
          <div
            style={{
              fontSize: 68,
              fontWeight: 700,
              color: "#fff",
              marginTop: 8,
            }}
          >
            The AI Bill of Rights
          </div>
        </div>

        {/* White body — the nine commitments, 3 rows x 3 columns */}
        <div
          style={{
            display: "flex",
            flex: 1,
            flexDirection: "column",
            justifyContent: "center",
            background: "#fff",
            padding: "0 56px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 26,
              fontWeight: 700,
              color: "#111827",
              marginBottom: 26,
            }}
          >
            Nine commitments we demand of every AI company
          </div>

          {[0, 3, 6].map((rowStart) => (
            <div
              key={rowStart}
              style={{
                display: "flex",
                flexDirection: "row",
                marginBottom: rowStart === 6 ? 0 : 16,
              }}
            >
              {ARTICLES.slice(rowStart, rowStart + 3).map((article, i) => (
                <div
                  key={article}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    width: 344,
                    marginRight: i === 2 ? 0 : 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: 34,
                      height: 34,
                      borderRadius: 17,
                      background: "#d1fae5",
                      color: "#047857",
                      fontSize: 18,
                      fontWeight: 700,
                      marginRight: 12,
                      flexShrink: 0,
                    }}
                  >
                    {rowStart + i + 1}
                  </div>
                  <div
                    style={{
                      display: "flex",
                      fontSize: 21,
                      color: "#374151",
                    }}
                  >
                    {article}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Amber CTA footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#fffbeb",
            borderTop: "2px solid #fde68a",
            padding: "18px 60px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 24,
              fontWeight: 700,
              color: "#92400e",
            }}
          >
            {ctaLine(count)}
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
