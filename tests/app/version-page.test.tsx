/**
 * /v/<version>: the page that holds the one on-site way to add your name to a
 * newer version, plus its "What changed" note and the archive label.
 *
 * The "Add my name" button is offered to exactly one kind of visitor: someone
 * who signed an earlier version, looking at the version that is open for
 * signing. Everyone else sees the document and the normal floating button.
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewerSignature } from "@/lib/viewer/signature";

const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  viewer: null as ViewerSignature | null,
  viewerLookups: 0,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href, ...rest }, children),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/db/queries", () => ({
  getVersionByString: async () => state.row,
}));
vi.mock("@/lib/viewer/signature", () => ({
  getViewerSignature: async () => {
    state.viewerLookups += 1;
    return state.viewer;
  },
}));
vi.mock("@/components/DocumentRenderer", () => ({ DocumentRenderer: () => null }));
vi.mock("@/components/AsCodeButton", () => ({ AsCodeButton: () => null }));
vi.mock("@/app/FloatingSignButton", () => ({ default: () => null }));
vi.mock("@/app/v/[version]/AddMyNameButton", () => ({
  AddMyNameButton: ({ version }: { version: string }) =>
    React.createElement("button", { "data-testid": "add-my-name" }, `Add my name to v${version}`),
}));

import VersionPage from "@/app/v/[version]/page";

const SIGNER = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";

function versionRow(version: string, isCurrent: boolean) {
  return {
    version,
    isCurrent,
    publishedAt: new Date("2026-07-24T00:00:00Z"),
    parsedJson: { sections: [] },
  };
}

async function renderPage(version: string): Promise<string> {
  const el = await VersionPage({ params: Promise.resolve({ version }) });
  return renderToStaticMarkup(el);
}

beforeEach(() => {
  state.row = versionRow("0.1.0", true);
  state.viewer = null;
  state.viewerLookups = 0;
});

describe("the Add my name button on /v/<current>", () => {
  it("is offered to someone who signed only an earlier version", async () => {
    state.viewer = { signerId: SIGNER, signerNumber: 12, newVersion: "0.1.0" };
    expect(await renderPage("0.1.0")).toContain("Add my name to v0.1.0");
  });

  it("is not offered to a signed-out or never-signed visitor", async () => {
    state.viewer = null;
    expect(await renderPage("0.1.0")).not.toContain("Add my name");
  });

  it("is not offered to someone who has already signed this version", async () => {
    state.viewer = { signerId: SIGNER, signerNumber: 12, newVersion: null };
    expect(await renderPage("0.1.0")).not.toContain("Add my name");
  });

  it("is never offered on a past version, and doesn't look the viewer up there", async () => {
    state.row = versionRow("0.0.1", false);
    state.viewer = { signerId: SIGNER, signerNumber: 12, newVersion: "0.1.0" };
    expect(await renderPage("0.0.1")).not.toContain("Add my name");
    expect(state.viewerLookups).toBe(0);
  });
});

describe("What changed", () => {
  it("opens /v/0.1.0 with its changelog, at the anchor the what-changed links use", async () => {
    const html = await renderPage("0.1.0");
    expect(html).toContain('id="what-changed"');
    expect(html).toContain("What changed in v0.1.0");
    expect(html).toContain("Adds Article 10");
  });

  it("is absent on the first version, which has nothing to have changed from", async () => {
    state.row = versionRow("0.0.1", false);
    const html = await renderPage("0.0.1");
    expect(html).not.toContain("What changed");
  });
});

describe("the archive label", () => {
  it("is not shown on the current version", async () => {
    expect(await renderPage("0.1.0")).not.toContain("Archive view");
  });

  it("is shown on a past version", async () => {
    state.row = versionRow("0.0.1", false);
    expect(await renderPage("0.0.1")).toContain("Archive view");
  });
});
