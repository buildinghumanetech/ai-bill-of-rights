import { describe, it, expect } from "vitest";
import { articles } from "@/app/HomepageArticles";
import { gist } from "@/components/CommitmentsSummary";

/**
 * `gist()` is what `<CommitmentsSummary>` puts under each of the nine titles on
 * the signer landing page. This file covers the function; that it actually
 * reaches the rendered HTML is pinned in `signatories.signer-page.test.tsx`
 * ("renders each commitment's gist, not its whole body"). Both halves are
 * needed — the function can be right and unwired, or wired and wrong.
 */

/**
 * Two canaries, pinned by hand — not all nine. Article 01 is several
 * sentences (the split has to happen); article 05 is one long em-dashed
 * sentence (it must not). Pinning the other seven only meant that a copy edit
 * to a living document failed a `gist` test with no opinion about the copy,
 * and the fix was a mechanical re-paste. Every article — including a tenth —
 * is still covered by the derived assertions below.
 */
const PINNED: Record<string, string> = {
  "01":
    "No AI company may use your conversations, your images, or your behavioral data to train their models without your explicit, informed, revocable consent.",
  "05":
    "When an AI system makes a consequential decision about you — your loan, your medical care, your content visibility, your job application — you have the right to know why, in plain language, and how to appeal it.",
};

describe("gist", () => {
  it("pins canaries that are still articles that ship", () => {
    const numbers = articles.map((a) => a.number);
    for (const number of Object.keys(PINNED)) {
      expect(numbers).toContain(number);
    }
  });

  for (const article of articles) {
    describe(`article ${article.number} — ${article.title}`, () => {
      const pinned = PINNED[article.number];
      if (pinned) {
        it("condenses to its pinned first sentence", () => {
          expect(gist(article.body)).toBe(pinned);
        });
      }

      it("is a non-empty prefix of the body", () => {
        const line = gist(article.body);
        expect(line.length).toBeGreaterThan(0);
        expect(article.body.startsWith(line)).toBe(true);
      });

      it("drops the rest of a multi-sentence body and keeps a lone sentence whole", () => {
        const body = article.body.trim();
        // Deliberately not `splitSentences` — asking the splitter whether the
        // body splits, then asserting that it split, would be circular. A
        // sentence mark before the final character is an independent tell.
        const hasInternalBreak = /[.!?]\s/.test(body.slice(0, -1));
        if (hasInternalBreak) {
          expect(gist(article.body).length).toBeLessThan(body.length);
        } else {
          expect(gist(article.body)).toBe(body);
        }
      });
    });
  }

  it("does not treat a lowercase-continued abbreviation as a sentence end", () => {
    expect(
      gist(
        "Models must disclose their training sources, e.g. scraped forum posts, on request. Opt-out is not consent.",
      ),
    ).toBe(
      "Models must disclose their training sources, e.g. scraped forum posts, on request.",
    );
    expect(
      gist("U.S. companies are not exempt. Neither is anyone else."),
    ).toBe("U.S. companies are not exempt.");
    expect(gist("This is consent vs. compliance. They are not the same.")).toBe(
      "This is consent vs. compliance.",
    );
  });

  it("ends a sentence on ? and ! as well as .", () => {
    expect(gist("Who decides what you see? The company does, today.")).toBe(
      "Who decides what you see?",
    );
    expect(gist("Opt-out is not consent! Buried checkboxes are not either.")).toBe(
      "Opt-out is not consent!",
    );
  });

  it("returns the whole body when it holds a single sentence", () => {
    const body = "You have the right to reach a human being.";
    expect(gist(body)).toBe(body);
  });

  it("returns an empty string rather than undefined for an empty body", () => {
    expect(gist("")).toBe("");
    expect(gist("   ")).toBe("");
  });

  /**
   * Known limit of the shared splitter: it ends a sentence at any `.` followed
   * by whitespace and a capital, so an abbreviation trailed by a proper noun
   * ("e.g. Common Crawl") still splits. Pinned so the boundary is a decision
   * rather than a surprise — tighten the splitter in `HomepageArticles` if an
   * article body ever needs this.
   */
  it("still splits an abbreviation followed by a capitalised word", () => {
    expect(
      gist("Public corpora, e.g. Common Crawl, are covered. So is everything else."),
    ).toBe("Public corpora, e.g.");
  });
});
