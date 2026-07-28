import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next/link and next/navigation need the Next runtime; stub them so the page
// components can be rendered as plain React on the server.
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => React.createElement("a", { href, ...rest }, children),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import ScorecardIndexPage, {
  metadata as indexMetadata,
} from "@/app/scorecard/page";
import ScorecardCompanyPage, {
  generateMetadata,
  generateStaticParams,
} from "@/app/scorecard/[slug]/page";
import { STATUS_LABELS } from "@/lib/scorecard";

/**
 * Everything rendered here comes from `content/scorecard/`, which contains
 * only the fictional Example AI Labs entry.
 */

async function renderIndex(): Promise<string> {
  return renderToStaticMarkup(ScorecardIndexPage() as React.ReactElement);
}

async function renderCompany(slug: string): Promise<string> {
  const el = await ScorecardCompanyPage({ params: Promise.resolve({ slug }) });
  return renderToStaticMarkup(el as React.ReactElement);
}

describe("/scorecard index page", () => {
  it("renders the eleven commitments and the example company", async () => {
    const html = await renderIndex();
    expect(html).toContain("The AI Bill of Rights Scorecard");
    expect(html).toContain("Example AI Labs");
    expect(html).toContain("Art. 1");
    expect(html).toContain("Art. 9");
    expect(html).toContain("Your Data Belongs to You");
  });

  it("discloses its own methodology on the page", async () => {
    const html = await renderIndex();
    expect(html).toContain("How to read this scorecard");
    expect(html).toContain("What this is not");
    expect(html).toContain("Every claim is cited");
    expect(html).toContain("Silence is not a verdict");
    expect(html).toContain("How to dispute an entry");
    expect(html).toContain("hello@ai-for-people.org");
    // The "last reviewed" date must be on the page, not just in the file.
    expect(html).toContain("2026-07-24");
  });

  it("labels the fictional entry as an example", async () => {
    const html = await renderIndex();
    expect(html).toContain("Example</span>");
  });

  it("does not count fictional entries toward coverage", async () => {
    const html = await renderIndex();
    expect(html).toContain("No companies have been assessed yet");
  });

  it("is unlisted: noindex, and carries OG metadata", () => {
    expect(indexMetadata.robots).toMatchObject({ index: false });
    expect(indexMetadata.openGraph?.title).toContain("Scorecard");
    const images = indexMetadata.openGraph?.images as Array<{ url: string }>;
    expect(images[0].url).toContain("/api/og/scorecard");
  });
});

describe("/scorecard/[slug] company page", () => {
  it("renders every assessed claim next to its source and check date", async () => {
    const html = await renderCompany("example-ai-labs");
    expect(html).toContain("Example AI Labs");
    expect(html).toContain("https://example.com/fictional-privacy-policy");
    expect(html).toContain("Example AI Labs — Privacy Policy (fictional)");
    expect(html).toContain("checked 2026-07-24");
    expect(html).toContain(STATUS_LABELS.meets);
  });

  it("renders unassessed commitments as such, never as a verdict", async () => {
    const html = await renderCompany("example-ai-labs");
    expect(html).toContain("Not yet assessed");
    expect(html).toContain("This is not a pass and not a failure");
    expect(html).toContain("no claim is being made either way");

    // Article 5 is untouched by the example file. Its section must carry the
    // not-assessed status and no citation block.
    const section = html.slice(html.indexOf('id="article-5"'));
    const nextSection = section.indexOf('id="article-6"');
    const article5 = nextSection === -1 ? section : section.slice(0, nextSection);
    expect(article5).toContain('data-status="not-assessed"');
    expect(article5).not.toContain("Source");
    expect(article5).not.toContain("checked ");
    for (const verdict of [
      STATUS_LABELS.meets,
      STATUS_LABELS.partial,
      STATUS_LABELS["falls-short"],
    ]) {
      expect(article5).not.toContain(verdict);
    }
  });

  it("says out loud how many commitments are unassessed", async () => {
    const html = await renderCompany("example-ai-labs");
    expect(html).toContain("3 of 11 commitments");
    expect(html).toContain("have not been assessed");
  });

  it("warns that the example company is not real", async () => {
    const html = await renderCompany("example-ai-labs");
    expect(html).toContain("is not a real company");
  });

  it("shows the methodology and the dispute route", async () => {
    const html = await renderCompany("example-ai-labs");
    expect(html).toContain("How to read this scorecard");
    expect(html).toContain("mailto:hello@ai-for-people.org");
    expect(html).toContain("Last reviewed");
  });

  it("offers share links carrying the channel param", async () => {
    const html = await renderCompany("example-ai-labs");
    expect(html).toContain("Share on X");
    expect(html).toContain("Share on LinkedIn");
    expect(html).toContain(encodeURIComponent("?via=x"));
    expect(html).toContain(encodeURIComponent("?via=linkedin"));
  });

  it("404s on an unknown company", async () => {
    await expect(renderCompany("no-such-company")).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });

  it("pre-renders a route per committed entry", async () => {
    expect(generateStaticParams()).toContainEqual({ slug: "example-ai-labs" });
  });

  it("builds noindex OG metadata pointing at the dynamic card", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ slug: "example-ai-labs" }),
    });
    expect(meta.robots).toMatchObject({ index: false });
    expect(meta.title).toContain("Example AI Labs");
    const images = meta.openGraph?.images as Array<{ url: string }>;
    expect(images[0].url).toContain("/api/og/scorecard/example-ai-labs");
  });
});
