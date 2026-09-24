/**
 * @vitest-environment jsdom
 */

/**
 * The homepage stops treating a signer as a stranger.
 *
 * Signing used to end with the page unchanged — "Be signer #93", a Sign button,
 * and the live banner announcing the signer to themselves as someone else. For
 * anyone who has signed ANY version the headline, floating button, its caption
 * and the banner now all know who they are; someone who signed only an
 * earlier version also gets a quiet "See what changed" line. For anyone else
 * nothing changes.
 * The provider is real; only its poll (fetch) and the sign modal are stubbed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/app/SignModal", () => ({ default: () => null }));

import {
  LiveSignersProvider,
  useLiveSigners,
} from "@/app/LiveSignersProvider";
import FloatingSignButton from "@/app/FloatingSignButton";
import LiveSignerBanner from "@/app/LiveSignerBanner";
import {
  LiveSignatureHeadline,
  LiveSignatureMomentumChip,
} from "@/app/SignatureCount";
import type { ViewerSignature } from "@/lib/viewer/signature";

const ME: ViewerSignature = {
  signerId: "eeeb0d40-7bee-4bc9-8808-fecb955a8db0",
  signerNumber: 92,
  newVersion: null,
};

/** Signed v0.0.1 only; v0.1.0 is current. */
const EARLIER: ViewerSignature = { ...ME, newVersion: "0.1.0" };

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let container: HTMLDivElement;
let root: Root;
let pollBody: { count: number; newSigners: unknown[] };

beforeEach(() => {
  pollBody = { count: 92, newSigners: [] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => pollBody })),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function Page() {
  return (
    <>
      <LiveSignerBanner />
      <h1>
        <LiveSignatureHeadline />
      </h1>
      <FloatingSignButton />
    </>
  );
}

async function render(initialViewer: ViewerSignature | null, count = 92) {
  // The mount poll must agree with the server-rendered count, as it does live.
  pollBody = { count, newSigners: [] };
  await act(async () => {
    root.render(
      <LiveSignersProvider initialCount={count} initialViewer={initialViewer}>
        <Page />
      </LiveSignersProvider>,
    );
  });
}

const text = () => container.textContent ?? "";

describe("a signer of the current version", () => {
  it("is thanked by number, with the milestone line", async () => {
    await render(ME);
    expect(text()).toContain("You're signer #92. Thank you.");
    expect(text()).toContain("8 more to reach 100.");
    expect(text()).not.toContain("Be signer");
  });

  it("sees no what-changed link", async () => {
    await render(ME);
    expect(text()).not.toContain("See what changed");
  });

  it("gets Share instead of Sign, captioned with their number", async () => {
    await render(ME);
    const button = container.querySelector("button")!;
    expect(button.textContent).toContain("Share the AI Bill of Rights");
    expect(text()).toContain("You're signer #92");
    expect(text()).not.toContain("You'd be signer");
  });

  it("is greeted as themselves when their own signature comes round in the banner", async () => {
    // The cold-start poll only primes the cursor; the next one announces.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await render(ME);
    pollBody = {
      count: 92,
      newSigners: [
        {
          id: ME.signerId,
          displayName: "E**** A*******",
          locationText: "Oakland, CA",
          signedAt: new Date().toISOString(),
        },
      ],
    };
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(text()).toContain("That's you.");
    expect(text()).toContain("Welcome, signer #92.");
    expect(text()).not.toContain("just signed");
  });
});

describe("a signer of an earlier version only", () => {
  it("is thanked by number like anyone else, with an optional link to what changed", async () => {
    await render(EARLIER);
    expect(text()).toContain("You're signer #92. Thank you.");
    expect(text()).toContain("v0.1.0 is out. See what changed.");
    const link = [...container.querySelectorAll("a")].find(
      (a) => a.textContent === "See what changed",
    );
    expect(link?.getAttribute("href")).toBe("/v/0.1.0#what-changed");
    expect(container.querySelector("button")!.textContent).toContain(
      "Share the AI Bill of Rights",
    );
  });

  it("loses the link once they have added their name to the new version", async () => {
    await render(EARLIER);
    expect(text()).toContain("See what changed");
    await render(ME);
    expect(text()).toContain("You're signer #92. Thank you.");
    expect(text()).not.toContain("See what changed");
  });
});

describe("anyone else", () => {
  it("sees the stranger's view, unchanged", async () => {
    await render(null, 91);
    expect(text()).toContain("Be signer #92");
    expect(text()).toContain("9 more to reach 100.");
    expect(container.querySelector("button")!.textContent).toContain(
      "Sign the AI Bill of Rights",
    );
    expect(text()).toContain("You'd be signer #92");
  });

  it("sees another signer announced as themselves", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await render(ME);
    pollBody = {
      count: 93,
      newSigners: [
        {
          id: "c06cbb39-bcb6-4b3c-bd22-e0154a4c7322",
          displayName: "Grace Hopper",
          locationText: null,
          signedAt: new Date().toISOString(),
        },
      ],
    };
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(text()).toContain("Grace Hopper");
    expect(text()).toContain("just signed");
    expect(text()).not.toContain("That's you.");
  });
});

describe("the switch-over", () => {
  it("happens the moment a signature succeeds, before any refresh", async () => {
    let setViewer: ((v: ViewerSignature | null) => void) | null = null;
    function Grab() {
      setViewer = useLiveSigners().setViewer;
      return null;
    }
    pollBody = { count: 91, newSigners: [] };
    await act(async () => {
      root.render(
        <LiveSignersProvider initialCount={91} initialViewer={null}>
          <Grab />
          <Page />
        </LiveSignersProvider>,
      );
    });
    expect(text()).toContain("Be signer #92");
    await act(async () => setViewer!(ME));
    expect(text()).toContain("You're signer #92. Thank you.");
    expect(container.querySelector("button")!.textContent).toContain("Share");
  });

  it("follows the server's answer after a refresh (e.g. signature removed)", async () => {
    await render(ME);
    expect(text()).toContain("You're signer #92");
    await render(null);
    expect(text()).toContain("Be signer #93");
    expect(text()).not.toContain("You're signer");
  });

  it("keeps the caption component on the same answer as the headline", async () => {
    await act(async () => {
      root.render(
        <LiveSignersProvider initialCount={92} initialViewer={ME}>
          <LiveSignatureMomentumChip />
        </LiveSignersProvider>,
      );
    });
    expect(text()).toBe("You're signer #92");
  });
});
