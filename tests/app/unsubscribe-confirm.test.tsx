/**
 * @vitest-environment jsdom
 */

/**
 * The /unsubscribe/<token> page: it names The People's AI Bill of Rights, and
 * keeps to the site palette (no green or purple).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { UnsubscribeConfirm } from "@/app/unsubscribe/[token]/UnsubscribeConfirm";
import { metadata } from "@/app/unsubscribe/[token]/page";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

function render(initial: "working" | "done" | "invalid" | "error") {
  act(() => root.render(<UnsubscribeConfirm token="tok" initial={initial} />));
}

const OFF_PALETTE = /green|purple|violet|emerald|lime|teal|fuchsia|indigo/;

describe("UnsubscribeConfirm", () => {
  it("confirms by the full name", () => {
    render("done");
    expect(container.textContent).toContain(
      "You won't get any more emails about new versions of The People's AI Bill of Rights.",
    );
    expect(container.querySelector("a")?.textContent).toBe(
      "Go to The People's AI Bill of Rights",
    );
    expect(container.textContent?.replace(/The People's AI Bill of Rights/g, "")).not.toContain(
      "AI Bill of Rights",
    );
  });

  it("gives the fallback button the site's blue pill", () => {
    render("error");
    const button = container.querySelector("button")!;
    expect(button.className).toContain("bg-[#2563eb]");
    expect(button.className).toContain("rounded-full");
    expect(button.className).toContain("text-white");
  });

  it("uses no green or purple in any state", () => {
    for (const state of ["working", "done", "invalid", "error"] as const) {
      render(state);
      expect(container.innerHTML).not.toMatch(OFF_PALETTE);
    }
  });

  it("names it in the page title", () => {
    expect(metadata.title).toBe("Unsubscribe from The People's AI Bill of Rights");
  });
});
