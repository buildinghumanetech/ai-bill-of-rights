import { describe, expect, it } from "vitest";
import {
  parseScorecardEntry,
  ScorecardValidationError,
} from "@/lib/scorecard/parse";
import type { Principle } from "@/lib/scorecard/principles";
import { isAssessed, assessedCount } from "@/lib/scorecard/types";

/**
 * Every company named in this file is invented. Nothing here is, or should
 * ever become, a claim about a real organisation.
 */

const PRINCIPLES: Principle[] = [1, 2, 3].map((n) => ({
  id: `article-${n}`,
  number: n,
  title: `Fictional Commitment ${n}`,
  headingText: `Article ${n}: Fictional Commitment ${n}`,
}));

function parse(raw: string, slug = "example-ai-labs") {
  return parseScorecardEntry(raw, slug, PRINCIPLES);
}

function errorsFrom(raw: string, slug = "example-ai-labs"): string[] {
  try {
    parse(raw, slug);
  } catch (err) {
    if (err instanceof ScorecardValidationError) return err.errors;
    throw err;
  }
  throw new Error("expected parseScorecardEntry to throw, but it succeeded");
}

const VALID = `---
company: Example AI Labs
slug: example-ai-labs
fictional: true
oneLiner: A fictional company.
homepageUrl: https://example.com
lastReviewed: 2026-07-24
reviewedBy: Fictional editorial council
disputeEmail: hello@ai-for-people.org
assessments:
  - principle: article-1
    status: meets
    assessment: |
      Fictional finding for a fictional company.
    citations:
      - url: https://example.com/fictional-policy
        title: Example AI Labs Policy (fictional)
        checkedOn: 2026-07-24
---

Body notes.
`;

describe("parseScorecardEntry — valid entries", () => {
  it("loads a well-formed entry", () => {
    const entry = parse(VALID);
    expect(entry.company).toBe("Example AI Labs");
    expect(entry.slug).toBe("example-ai-labs");
    expect(entry.fictional).toBe(true);
    expect(entry.lastReviewed).toBe("2026-07-24");
    expect(entry.disputeEmail).toBe("hello@ai-for-people.org");
    expect(entry.notes).toBe("Body notes.");
  });

  it("keeps the citation attached to the claim it supports", () => {
    const a = parse(VALID).assessments[0];
    expect(isAssessed(a)).toBe(true);
    if (!isAssessed(a)) return;
    expect(a.citations).toHaveLength(1);
    expect(a.citations[0]).toMatchObject({
      url: "https://example.com/fictional-policy",
      title: "Example AI Labs Policy (fictional)",
      checkedOn: "2026-07-24",
    });
  });

  it("accepts an unquoted YAML date, which parses as a Date object", () => {
    // `lastReviewed: 2026-07-24` (unquoted) becomes a Date, not a string.
    expect(parse(VALID).lastReviewed).toBe("2026-07-24");
  });

  it("carries an optional quote through when supplied", () => {
    const raw = VALID.replace(
      "        checkedOn: 2026-07-24",
      "        checkedOn: 2026-07-24\n        quote: A fabricated sentence.",
    );
    const a = parse(raw).assessments[0];
    if (!isAssessed(a)) throw new Error("expected an assessed row");
    expect(a.citations[0].quote).toBe("A fabricated sentence.");
  });
});

describe("parseScorecardEntry — the citation rule", () => {
  it("REJECTS an assessed claim with no citations key at all", () => {
    const raw = `---
company: Acme Intelligence Corp
fictional: true
lastReviewed: 2026-07-24
assessments:
  - principle: article-1
    status: falls-short
    assessment: An uncited claim about a company.
---
`;
    const errors = errorsFrom(raw, "acme-intelligence-corp");
    expect(errors.some((e) => /requires at least one citation/i.test(e))).toBe(
      true,
    );
  });

  it("REJECTS an assessed claim with an empty citations list", () => {
    const raw = `---
company: Acme Intelligence Corp
fictional: true
lastReviewed: 2026-07-24
assessments:
  - principle: article-2
    status: meets
    assessment: An uncited claim.
    citations: []
---
`;
    expect(
      errorsFrom(raw, "acme-intelligence-corp").some((e) =>
        /requires at least one citation/i.test(e),
      ),
    ).toBe(true);
  });

  it("rejects every assessed status without a citation, not just the negative ones", () => {
    for (const status of ["meets", "partial", "falls-short", "unclear"]) {
      const raw = `---
company: Placeholder Systems
fictional: true
lastReviewed: 2026-07-24
assessments:
  - principle: article-1
    status: ${status}
    assessment: A claim with no source.
---
`;
      expect(
        errorsFrom(raw, "placeholder-systems").some((e) =>
          /requires at least one citation/i.test(e),
        ),
        `status "${status}" should require a citation`,
      ).toBe(true);
    }
  });

  it("rejects a citation missing its url", () => {
    const raw = `---
company: Placeholder Systems
fictional: true
lastReviewed: 2026-07-24
assessments:
  - principle: article-1
    status: meets
    assessment: A claim.
    citations:
      - title: Some document
        checkedOn: 2026-07-24
---
`;
    expect(
      errorsFrom(raw, "placeholder-systems").some((e) =>
        /citation "url" must be an absolute http\(s\) URL/.test(e),
      ),
    ).toBe(true);
  });

  it("rejects a citation whose url is not an absolute http(s) URL", () => {
    for (const url of ["/relative/path", "ftp://example.com/x", "not a url"]) {
      const raw = `---
company: Placeholder Systems
fictional: true
lastReviewed: 2026-07-24
assessments:
  - principle: article-1
    status: meets
    assessment: A claim.
    citations:
      - url: "${url}"
        title: Some document
        checkedOn: 2026-07-24
---
`;
      expect(
        errorsFrom(raw, "placeholder-systems").some((e) => /citation "url"/.test(e)),
        `url "${url}" should be rejected`,
      ).toBe(true);
    }
  });

  it("rejects a citation missing checkedOn, and one with a bad date", () => {
    const missing = `---
company: Placeholder Systems
fictional: true
lastReviewed: 2026-07-24
assessments:
  - principle: article-1
    status: meets
    assessment: A claim.
    citations:
      - url: https://example.com/doc
        title: Some document
---
`;
    expect(
      errorsFrom(missing, "placeholder-systems").some((e) =>
        /citation "checkedOn"/.test(e),
      ),
    ).toBe(true);

    // Anything that isn't an ISO date is rejected. (An unquoted `2026-07-24`
    // is handled by YAML itself and arrives as a Date; these are the shapes a
    // human actually mistypes.)
    for (const bad of ['"last spring"', '"2026-7-4"', '"07/24/2026"', "true"]) {
      const raw = missing.replace(
        "        title: Some document",
        `        title: Some document\n        checkedOn: ${bad}`,
      );
      expect(
        errorsFrom(raw, "placeholder-systems").some((e) =>
          /citation "checkedOn"/.test(e),
        ),
        `checkedOn ${bad} should be rejected`,
      ).toBe(true);
    }
  });

  it("rejects a citation missing its title", () => {
    const raw = `---
company: Placeholder Systems
fictional: true
lastReviewed: 2026-07-24
assessments:
  - principle: article-1
    status: meets
    assessment: A claim.
    citations:
      - url: https://example.com/doc
        checkedOn: 2026-07-24
---
`;
    expect(
      errorsFrom(raw, "placeholder-systems").some((e) =>
        /citation "title" is required/.test(e),
      ),
    ).toBe(true);
  });

  it("rejects an assessed status with a citation but no assessment prose", () => {
    const raw = `---
company: Placeholder Systems
fictional: true
lastReviewed: 2026-07-24
assessments:
  - principle: article-1
    status: falls-short
    citations:
      - url: https://example.com/doc
        title: Some document
        checkedOn: 2026-07-24
---
`;
    expect(
      errorsFrom(raw, "placeholder-systems").some((e) =>
        /requires an "assessment"/.test(e),
      ),
    ).toBe(true);
  });
});

describe("parseScorecardEntry — the unassessed path", () => {
  const BARE = `---
company: Acme Intelligence Corp
fictional: true
lastReviewed: 2026-07-24
---
`;

  it("defaults every unlisted commitment to not-assessed", () => {
    const entry = parse(BARE, "acme-intelligence-corp");
    expect(entry.assessments).toHaveLength(PRINCIPLES.length);
    expect(entry.assessments.every((a) => a.status === "not-assessed")).toBe(
      true,
    );
    expect(assessedCount(entry)).toBe(0);
  });

  it("gives unassessed rows no prose and no citations", () => {
    for (const a of parse(BARE, "acme-intelligence-corp").assessments) {
      expect(a.assessment).toBeNull();
      expect(a.citations).toEqual([]);
      expect(isAssessed(a)).toBe(false);
    }
  });

  it("accepts an explicit not-assessed row", () => {
    const raw = `---
company: Acme Intelligence Corp
fictional: true
lastReviewed: 2026-07-24
assessments:
  - principle: article-2
    status: not-assessed
---
`;
    const entry = parse(raw, "acme-intelligence-corp");
    expect(entry.assessments[1].status).toBe("not-assessed");
  });

  it("REJECTS a not-assessed row that smuggles in an assessment", () => {
    const raw = `---
company: Acme Intelligence Corp
fictional: true
lastReviewed: 2026-07-24
assessments:
  - principle: article-1
    status: not-assessed
    assessment: They are probably fine.
---
`;
    expect(
      errorsFrom(raw, "acme-intelligence-corp").some((e) =>
        /status is "not-assessed" but an "assessment" was written/.test(e),
      ),
    ).toBe(true);
  });

  it("REJECTS a not-assessed row that carries citations", () => {
    const raw = `---
company: Acme Intelligence Corp
fictional: true
lastReviewed: 2026-07-24
assessments:
  - principle: article-1
    status: not-assessed
    citations:
      - url: https://example.com/doc
        title: Some document
        checkedOn: 2026-07-24
---
`;
    expect(
      errorsFrom(raw, "acme-intelligence-corp").some((e) =>
        /makes no claim, so it cites nothing/.test(e),
      ),
    ).toBe(true);
  });

  it("keeps counting an entry as partially filled rather than complete", () => {
    const entry = parse(VALID);
    expect(assessedCount(entry)).toBe(1);
    expect(entry.assessments).toHaveLength(3);
  });
});

describe("parseScorecardEntry — entry-level validation", () => {
  it("requires company", () => {
    const raw = `---
fictional: true
lastReviewed: 2026-07-24
---
`;
    expect(errorsFrom(raw).some((e) => /"company" is required/.test(e))).toBe(
      true,
    );
  });

  it("requires an explicit fictional flag", () => {
    const raw = `---
company: Acme Intelligence Corp
lastReviewed: 2026-07-24
---
`;
    expect(
      errorsFrom(raw, "acme-intelligence-corp").some((e) =>
        /"fictional" is required/.test(e),
      ),
    ).toBe(true);
  });

  it("requires an ISO lastReviewed", () => {
    const raw = `---
company: Acme Intelligence Corp
fictional: false
lastReviewed: sometime last spring
---
`;
    expect(
      errorsFrom(raw, "acme-intelligence-corp").some((e) =>
        /"lastReviewed" is required/.test(e),
      ),
    ).toBe(true);
  });

  it("rejects a frontmatter slug that disagrees with the filename", () => {
    const raw = `---
company: Acme Intelligence Corp
slug: some-other-company
fictional: true
lastReviewed: 2026-07-24
---
`;
    expect(
      errorsFrom(raw, "acme-intelligence-corp").some((e) =>
        /does not match the filename/.test(e),
      ),
    ).toBe(true);
  });

  it("rejects an unknown principle id", () => {
    const raw = `---
company: Acme Intelligence Corp
fictional: true
lastReviewed: 2026-07-24
assessments:
  - principle: article-99
    status: not-assessed
---
`;
    expect(
      errorsFrom(raw, "acme-intelligence-corp").some((e) =>
        /unknown principle "article-99"/.test(e),
      ),
    ).toBe(true);
  });

  it("rejects a duplicate principle row", () => {
    const raw = `---
company: Acme Intelligence Corp
fictional: true
lastReviewed: 2026-07-24
assessments:
  - principle: article-1
    status: not-assessed
  - principle: article-1
    status: not-assessed
---
`;
    expect(
      errorsFrom(raw, "acme-intelligence-corp").some((e) =>
        /duplicate entry for "article-1"/.test(e),
      ),
    ).toBe(true);
  });

  it("rejects an unknown status", () => {
    const raw = `---
company: Acme Intelligence Corp
fictional: true
lastReviewed: 2026-07-24
assessments:
  - principle: article-1
    status: A+
---
`;
    expect(
      errorsFrom(raw, "acme-intelligence-corp").some((e) =>
        /"status" must be one of/.test(e),
      ),
    ).toBe(true);
  });

  it("reports every problem at once rather than only the first", () => {
    const raw = `---
fictional: maybe
lastReviewed: nope
assessments:
  - principle: article-1
    status: meets
    assessment: A claim.
---
`;
    expect(errorsFrom(raw).length).toBeGreaterThanOrEqual(4);
  });

  it("throws a ScorecardValidationError naming the slug", () => {
    let caught: unknown;
    try {
      parse(`---\nfictional: true\nlastReviewed: 2026-07-24\n---\n`, "acme-intelligence-corp");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(ScorecardValidationError);
    expect((caught as ScorecardValidationError).slug).toBe(
      "acme-intelligence-corp",
    );
  });
});
