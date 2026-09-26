/**
 * The generated share cards (the "I signed" card and both scorecard cards)
 * wear the site's look: light gray band with a hairline border, gray uppercase
 * tag, near-black type, blue accents, Geist. No green as a brand or accent
 * color (it appears only in scorecard status pills, where "Meets" keeps the
 * same green as the scorecard page), no old domain, no em dashes.
 *
 * `next/og` is replaced with a recorder, so these assertions read the element
 * tree and options each route hands to ImageResponse rather than pixels. The
 * real render is covered by og.signer.test.ts.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

const captured = vi.hoisted(() => ({
  calls: [] as Array<{ element: unknown; options: Record<string, unknown> }>,
}));

vi.mock("next/og", () => ({
  ImageResponse: class {
    constructor(element: unknown, options: Record<string, unknown>) {
      captured.calls.push({ element, options });
    }
  },
}));
vi.mock("@/lib/db/queries", () => ({
  getSignerById: vi.fn(),
  getSignatureNumber: vi.fn(),
}));
vi.mock("@/lib/selfie/queries", () => ({
  getActiveSelfieForSigner: vi.fn(async () => null),
}));

import { GET as signerCard } from "@/app/api/og/signer/[id]/route";
import { GET as scorecardCard } from "@/app/api/og/scorecard/route";
import { GET as companyCard } from "@/app/api/og/scorecard/[slug]/route";
import { getSignerById, getSignatureNumber } from "@/lib/db/queries";
import { STATUS_SWATCH } from "@/app/api/og/scorecard/card";

const SIGNER_ID = "11111111-1111-4111-8111-111111111111";

type Node = { style: Record<string, unknown>; text: string };

/** Every host element, with its style and its own direct text. */
function flatten(node: ReactNode, out: Node[] = []): Node[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (Array.isArray(node)) {
    node.forEach((n) => flatten(n, out));
    return out;
  }
  if (typeof node === "string" || typeof node === "number") return out;
  const el = node as ReactElement<{ style?: Record<string, unknown>; children?: ReactNode }>;
  if (typeof el.type === "function") {
    return flatten((el.type as (p: unknown) => ReactNode)(el.props), out);
  }
  const children = el.props?.children;
  const own = (Array.isArray(children) ? children : [children])
    .filter((c) => typeof c === "string" || typeof c === "number")
    .join("");
  out.push({ style: el.props?.style ?? {}, text: own });
  flatten(children, out);
  return out;
}

const AMBERS = ["#fffbeb", "#fef3c7", "#fde68a", "#fcd34d", "#92400e"];

const GREENS = [
  "#059669", "#047857", "#065f46", "#064e3b", "#10b981", "#34d399",
  "#6ee7b7", "#a7f3d0", "#d1fae5", "#ecfdf5", "#16a34a", "#22c55e",
];

const SWATCHES = Object.values(STATUS_SWATCH);

/** A status pill, or the verdict label inside one: the only place green may appear. */
function isStatusPill(n: Node): boolean {
  return SWATCHES.some(
    (s) =>
      // The pill: its swatch's background AND its swatch's border together.
      (n.style.background === s.bg && n.style.border === `2px solid ${s.border}`) ||
      // The verdict inside it: its swatch's color on its swatch's own label.
      (n.style.color === s.fg && n.text === s.label),
  );
}

function expectSiteLook(nodes: Node[]) {
  const brand = nodes.filter((n) => !isStatusPill(n));
  const styles = JSON.stringify(brand.map((n) => n.style)).toLowerCase();
  for (const g of GREENS) expect(styles).not.toContain(g);
  // Amber too is a status color only (the "Partial" pill), never chrome.
  for (const a of AMBERS) expect(styles).not.toContain(a);
  const text = nodes.map((n) => n.text).join(" ");
  expect(text).not.toContain("—");
  expect(text).not.toMatch(/ai-for-people|first 1,000/i);
  const band = nodes.find((n) => n.style.background === "#fafafa");
  expect(band?.style.borderBottom).toBe("1px solid #e4e4e7");
  const tag = nodes.find((n) => n.style.textTransform === "uppercase" && n.text.includes("The People's AI Bill of Rights"));
  expect(tag?.style.color).toBe("#71717a");
}

function expectGeist(options: Record<string, unknown>) {
  const fonts = options.fonts as Array<{ name: string; weight: number; data: Buffer }>;
  expect(fonts.map((f) => [f.name, f.weight])).toEqual([
    ["Geist", 400],
    ["Geist", 600],
    ["Geist", 700],
  ]);
  for (const f of fonts) expect(f.data.byteLength).toBeGreaterThan(10_000);
}

beforeEach(() => {
  captured.calls.length = 0;
});

async function renderSigner(whyISigned: string | null) {
  vi.mocked(getSignerById).mockResolvedValue({
    id: SIGNER_ID,
    displayName: "Sample Signer",
    affiliation: null,
    locationText: "Oakland, California",
    whyISigned,
  } as never);
  vi.mocked(getSignatureNumber).mockResolvedValue(42);
  await signerCard(new Request("http://localhost"), {
    params: Promise.resolve({ id: SIGNER_ID }),
  });
  const { element, options } = captured.calls[0];
  return { nodes: flatten(element as ReactNode), options };
}

describe("the I signed card", () => {
  it("says I signed. in near-black, then the number in blue, under the gray tag", async () => {
    const { nodes, options } = await renderSigner(null);
    expectSiteLook(nodes);
    expectGeist(options);
    expect(nodes.find((n) => n.text === "I signed.")?.style.color).toBe("#09090b");
    expect(nodes.find((n) => n.text === "Signer #42")?.style.color).toBe("#2563eb");
    const avatar = nodes.find((n) => n.text === "S");
    expect(avatar?.style.background).toBe("#dbeafe");
    expect(avatar?.style.color).toBe("#2563eb");
    // No quote, no quote column.
    expect(nodes.some((n) => n.text === "Why I signed")).toBe(false);
  });

  it("ends with the call to action in a light gray band, not amber", async () => {
    const { nodes } = await renderSigner(null);
    const cta = nodes.find((n) => n.text === "Join them. Sign at theaibill.org");
    expect(cta?.style.color).toBe("#71717a");
    const bands = nodes.filter((n) => n.style.background === "#fafafa");
    expect(bands).toHaveLength(2);
    expect(bands[1].style.borderTop).toBe("1px solid #e4e4e7");
    const styles = JSON.stringify(nodes.map((n) => n.style)).toLowerCase();
    for (const amber of ["#fffbeb", "#fde68a", "#92400e"]) {
      expect(styles).not.toContain(amber);
    }
  });

  it("marks the quote with a blue label and a blue left bar", async () => {
    const { nodes } = await renderSigner("Because the people who use AI should have a say.");
    expectSiteLook(nodes);
    expect(nodes.find((n) => n.text === "Why I signed")?.style.color).toBe("#2563eb");
    expect(nodes.find((n) => String(n.style.borderLeft ?? "").includes("#2563eb"))).toBeDefined();
  });
});

describe("the scorecard cards", () => {
  it("share the look, the tag and Geist on the index card", async () => {
    await scorecardCard();
    const { element, options } = captured.calls[0];
    expectSiteLook(flatten(element as ReactNode));
    expectGeist(options);
  });

  it("share the look, the tag and Geist on a company card, and keep status colors", async () => {
    await companyCard(new Request("http://localhost"), {
      params: Promise.resolve({ slug: "example-ai-labs" }),
    });
    const { element, options } = captured.calls[0];
    const nodes = flatten(element as ReactNode);
    expectSiteLook(nodes);
    expectGeist(options);
    // "Meets" keeps its green, as on the scorecard page; the example entry
    // has one, so the pill is actually drawn here.
    expect(GREENS).toContain(STATUS_SWATCH.meets.bg);
    expect(GREENS).toContain(STATUS_SWATCH.meets.border);
    const meets = nodes.find((n) => n.text === "Meets");
    expect(meets?.style.color).toBe(STATUS_SWATCH.meets.fg);
    expect(nodes.some((n) => n.style.background === STATUS_SWATCH.meets.bg)).toBe(true);
    // The example-entry strip and the footer are the light gray band.
    for (const text of ["EXAMPLE ENTRY: NOT A REAL COMPANY", "theaibill.org/scorecard: read the sources yourself"]) {
      const node = nodes.find((n) => n.text === text);
      expect(node?.style.color).toBe("#71717a");
    }
    const strip = nodes.find((n) => n.text === "EXAMPLE ENTRY: NOT A REAL COMPANY");
    expect(strip?.style.background).toBe("#fafafa");
    expect(strip?.style.borderBottom).toBe("1px solid #e4e4e7");
    // The Partial pill keeps its amber.
    expect(nodes.find((n) => n.text === "Partial")?.style.color).toBe(STATUS_SWATCH.partial.fg);
  });
});
