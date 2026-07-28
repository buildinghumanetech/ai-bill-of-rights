import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import {
  RAW_COUNT_THRESHOLD,
  SignatureHeadline,
  SignatureMomentumChip,
  SignatureMomentumPanel,
  getSignatureFraming,
  nextCohortGoal,
  type MomentumSigner,
} from "@/components/SignatureMomentum";

/**
 * The crux of this suite: the signature count must be framed as *early-adopter
 * scarcity* while it is small, and as a plain big number once it is large.
 * Every assertion below is paired — one under the threshold, one over it.
 */

/** Today's real production count. */
const SMALL_COUNT = 90;
/** Comfortably past the crossover. */
const LARGE_COUNT = RAW_COUNT_THRESHOLD + 1_000;

const render = (el: ReactElement) => renderToStaticMarkup(el);
/** Strip tags so assertions match copy the visitor actually reads. */
const text = (el: ReactElement) =>
  render(el)
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&");

describe("getSignatureFraming", () => {
  it("returns early framing below the threshold", () => {
    const framing = getSignatureFraming(SMALL_COUNT);
    expect(framing.mode).toBe("early");
    if (framing.mode !== "early") throw new Error("unreachable");
    expect(framing.count).toBe(90);
    expect(framing.goal).toBe(1_000);
    expect(framing.remaining).toBe(910);
    expect(framing.percent).toBe(9);
    expect(framing.nextOrdinal).toBe(91);
  });

  it("returns scale framing at and above the threshold", () => {
    expect(getSignatureFraming(RAW_COUNT_THRESHOLD).mode).toBe("scale");
    expect(getSignatureFraming(LARGE_COUNT).mode).toBe("scale");
  });

  it("stays in early framing one signature below the threshold", () => {
    expect(getSignatureFraming(RAW_COUNT_THRESHOLD - 1).mode).toBe("early");
  });

  it("climbs the goal ladder so the gap is never already closed", () => {
    expect(nextCohortGoal(0)).toBe(1_000);
    expect(nextCohortGoal(999)).toBe(1_000);
    expect(nextCohortGoal(1_000)).toBe(2_500);
    expect(nextCohortGoal(2_500)).toBe(RAW_COUNT_THRESHOLD);

    for (const count of [0, 1, 999, 1_000, 2_500, RAW_COUNT_THRESHOLD - 1]) {
      const framing = getSignatureFraming(count);
      expect(framing.mode).toBe("early");
      if (framing.mode !== "early") throw new Error("unreachable");
      expect(framing.goal).toBeGreaterThan(count);
      expect(framing.remaining).toBeGreaterThan(0);
      expect(framing.percent).toBeGreaterThanOrEqual(0);
      expect(framing.percent).toBeLessThanOrEqual(100);
    }
  });

  it("clamps nonsense counts to zero rather than rendering NaN", () => {
    const framing = getSignatureFraming(Number.NaN);
    expect(framing.mode).toBe("early");
    if (framing.mode !== "early") throw new Error("unreachable");
    expect(framing.count).toBe(0);
    expect(framing.percent).toBe(0);
    expect(framing.nextOrdinal).toBe(1);
  });
});

describe("SignatureHeadline", () => {
  it("offers the visitor a position instead of a small total below the threshold", () => {
    const copy = text(<SignatureHeadline count={SMALL_COUNT} />);
    expect(copy).toContain("Be signer #91");
    expect(copy).toContain("of the first 1,000");
    // The deflating "90 signatures to back them up" must be gone.
    expect(copy).not.toContain("90 signatures");
    expect(copy).not.toContain("to back them up");
  });

  it("states the raw number plainly above the threshold", () => {
    const copy = text(<SignatureHeadline count={LARGE_COUNT} />);
    expect(copy).toContain("6,000 signatures");
    expect(copy).toContain("to back them up");
    expect(copy).not.toContain("Be signer");
    expect(copy).not.toContain("of the first");
  });

  it("keeps /signers linked on both sides of the threshold", () => {
    expect(render(<SignatureHeadline count={SMALL_COUNT} />)).toContain(
      'href="/signers"',
    );
    expect(render(<SignatureHeadline count={LARGE_COUNT} />)).toContain(
      'href="/signers"',
    );
  });
});

describe("SignatureMomentumPanel", () => {
  /**
   * Deliberately longer than the chip cap: the panel is handed an over-pulled
   * sample (see `loadSignerSample` in `src/app/page.tsx`) so that signers with
   * a blank display name can be filtered out without shrinking the row.
   */
  const sample: MomentumSigner[] = [
    { displayName: "Ada Lovelace", affiliation: "Analytical Engines", locationText: "London, UK" },
    { displayName: "Grace Hopper", affiliation: null, locationText: "Arlington, VA" },
    { displayName: "Alan Turing", affiliation: null, locationText: null },
    { displayName: "Katherine Johnson", affiliation: "NASA", locationText: "Hampton, VA" },
    { displayName: "Barbara Liskov", affiliation: null, locationText: "Cambridge, MA" },
  ];

  it("shows a goal, a gap and a progress bar below the threshold", () => {
    const html = render(
      <SignatureMomentumPanel count={SMALL_COUNT} sample={sample} />,
    );
    const copy = text(
      <SignatureMomentumPanel count={SMALL_COUNT} sample={sample} />,
    );

    expect(copy).toContain("90 of our first 1,000 signatures");
    expect(copy).toContain("910 to go.");
    expect(copy).toContain("number 91");

    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="90"');
    expect(html).toContain('aria-valuemax="1000"');

    // Never the old counter-proof phrasing.
    expect(copy).not.toContain("Join 90 other real people");
  });

  it("shows who signed as proof-of-quality below the threshold", () => {
    const copy = text(
      <SignatureMomentumPanel count={SMALL_COUNT} sample={sample} />,
    );
    expect(copy).toContain("Recently signed by");
    // Affiliation wins over location when both exist.
    expect(copy).toContain("Ada Lovelace · Analytical Engines");
    // Falls back to location when there's no affiliation.
    expect(copy).toContain("Grace Hopper · Arlington, VA");
    // A signer with neither still renders, without a dangling separator.
    expect(copy).toContain("Alan Turing");
    expect(copy).not.toContain("Alan Turing ·");
  });

  it("shows at most three signers, so the row stays on one line", () => {
    const html = render(
      <SignatureMomentumPanel count={SMALL_COUNT} sample={sample} />,
    );
    const copy = text(
      <SignatureMomentumPanel count={SMALL_COUNT} sample={sample} />,
    );

    expect(copy).toContain("Ada Lovelace");
    expect(copy).toContain("Grace Hopper");
    expect(copy).toContain("Alan Turing");
    // The 4th and 5th of an over-pulled sample never render.
    expect(copy).not.toContain("Katherine Johnson");
    expect(copy).not.toContain("Barbara Liskov");
    expect(html.match(/<li /g) ?? []).toHaveLength(3);
  });

  it("skips signers with a blank display name without shrinking the row", () => {
    const withBlanks: MomentumSigner[] = [
      { displayName: "  ", affiliation: null, locationText: null },
      ...sample,
    ];
    const copy = text(
      <SignatureMomentumPanel count={SMALL_COUNT} sample={withBlanks} />,
    );
    expect(copy).toContain("Ada Lovelace");
    expect(copy).toContain("Alan Turing");
    expect(copy).not.toContain("Katherine Johnson");
  });

  it("renders without a signer sample", () => {
    const copy = text(<SignatureMomentumPanel count={SMALL_COUNT} />);
    expect(copy).toContain("90 of our first 1,000 signatures");
    expect(copy).not.toContain("Recently signed by");
  });

  it("drops the goal framing and leads with the number above the threshold", () => {
    const html = render(
      <SignatureMomentumPanel count={LARGE_COUNT} sample={sample} />,
    );
    const copy = text(
      <SignatureMomentumPanel count={LARGE_COUNT} sample={sample} />,
    );

    expect(copy).toContain("Join 6,000 other real people");
    expect(copy).toContain("who have signed this AI Bill of Rights");

    expect(html).not.toContain('role="progressbar"');
    expect(copy).not.toContain("of our first");
    expect(copy).not.toContain("to go.");
    expect(copy).not.toContain("Recently signed by");
  });

  it("keeps /signers linked on both sides of the threshold", () => {
    expect(
      render(<SignatureMomentumPanel count={SMALL_COUNT} sample={sample} />),
    ).toContain('href="/signers"');
    expect(
      render(<SignatureMomentumPanel count={LARGE_COUNT} sample={sample} />),
    ).toContain('href="/signers"');
  });
});

describe("SignatureMomentumChip", () => {
  it("gives the visitor their own number below the threshold", () => {
    const copy = text(<SignatureMomentumChip count={SMALL_COUNT} />);
    expect(copy).toContain("You'd be signer #91");
    expect(copy).toContain("of the first 1,000");
    expect(copy).not.toContain("Join 90 others");
  });

  it("says how many others above the threshold", () => {
    const copy = text(<SignatureMomentumChip count={LARGE_COUNT} />);
    expect(copy).toContain("Join 6,000 others who have already signed");
    expect(copy).not.toContain("You'd be signer");
  });

  it("keeps /signers linked on both sides of the threshold", () => {
    expect(render(<SignatureMomentumChip count={SMALL_COUNT} />)).toContain(
      'href="/signers"',
    );
    expect(render(<SignatureMomentumChip count={LARGE_COUNT} />)).toContain(
      'href="/signers"',
    );
  });
});
