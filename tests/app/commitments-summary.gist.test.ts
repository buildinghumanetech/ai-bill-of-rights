import { describe, it, expect } from "vitest";
import { articles } from "@/app/HomepageArticles";
import { gist } from "@/components/CommitmentsSummary";

/**
 * `gist()` is what `<CommitmentsSummary>` puts under each of the nine titles on
 * the signer landing page. The page test only asserts that the article *titles*
 * render, so without this file `gist()` could return "" — or the entire
 * paragraph — for every article and the suite would stay green.
 */

/** The exact line each article must condense to. Pinned, not derived. */
const EXPECTED: Record<string, string> = {
  "01":
    "No AI company may use your conversations, your images, or your behavioral data to train their models without your explicit, informed, revocable consent.",
  "02":
    "Everything an AI system learns about you must be exportable by you, in a readable format, at any time.",
  "03": "No AI system may pretend to be human when you sincerely ask.",
  "04":
    "AI systems must not use psychological techniques — urgency, social pressure, manufactured intimacy, dependency loops, or persuasive dark patterns — to get you to buy, believe, or stay.",
  "05":
    "When an AI system makes a consequential decision about you — your loan, your medical care, your content visibility, your job application — you have the right to know why, in plain language, and how to appeal it.",
  "06":
    "In any situation involving significant consequence — health, legal, financial, crisis — you have the right to reach a human being.",
  "07": "AI systems interacting with minors must meet a higher standard of care.",
  "08":
    "Frontier AI companies must publish independent, third-party assessments of their systems' impacts on user wellbeing — not self-reported metrics, not cherry-picked studies.",
  "09":
    "AI systems must be designed to serve what you actually came to do — not to extend your session, maximize your engagement, or redirect your focus toward the platform's interests.",
};

describe("gist", () => {
  it("covers every article that ships, so a tenth cannot slip past untested", () => {
    expect(articles.map((a) => a.number)).toEqual(Object.keys(EXPECTED));
  });

  for (const article of articles) {
    describe(`article ${article.number} — ${article.title}`, () => {
      it("condenses to its first sentence", () => {
        expect(gist(article.body)).toBe(EXPECTED[article.number]);
      });

      it("is a non-empty prefix of the body", () => {
        const line = gist(article.body);
        expect(line.length).toBeGreaterThan(0);
        expect(article.body.startsWith(line)).toBe(true);
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
