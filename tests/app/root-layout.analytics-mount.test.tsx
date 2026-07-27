/**
 * `<SiteAnalytics />` has to be in the root layout, and nothing else in the
 * suite notices if it isn't.
 *
 * `track()` from @vercel/analytics is a NO-OP unless the vendor script was
 * injected. Delete the one line in layout.tsx that mounts this component and
 * every funnel event on the site is still written, still called, and silently
 * discarded — with a fully green test suite. That is exactly the bug class the
 * analytics work exists to fix, so it gets its own pin.
 */

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";

// The layout pulls in fonts, Clerk, global CSS and a database read. None of
// that is what this test is about — stub it down to pass-throughs so the tree
// still renders its children.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
}));
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/MyAccountButton", () => ({ MyAccountButton: () => null }));
vi.mock("@/lib/db/queries", () => ({
  getSignatureCount: vi.fn(async () => 0),
}));
vi.mock("@/app/LiveSignersProvider", () => ({
  LiveSignersProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/app/LiveSignerBanner", () => ({ default: () => null }));

// The marker. If the layout stops rendering SiteAnalytics, this never appears.
vi.mock("@/lib/analytics/SiteAnalytics", () => ({
  SiteAnalytics: () => <div data-site-analytics="mounted" />,
}));

import RootLayout from "@/app/layout";

async function renderLayout(): Promise<string> {
  const tree = await RootLayout({ children: null });
  return renderToStaticMarkup(tree);
}

describe("root layout analytics mount", () => {
  it("mounts <SiteAnalytics /> so track() is not a silent no-op", async () => {
    expect(await renderLayout()).toContain('data-site-analytics="mounted"');
  });

  it("mounts it exactly once", async () => {
    const html = await renderLayout();
    expect(html.match(/data-site-analytics="mounted"/g)).toHaveLength(1);
  });
});
