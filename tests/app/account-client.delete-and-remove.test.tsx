// @vitest-environment jsdom
/**
 * The two destructive controls on /account, and how they differ.
 *
 * "Delete my account" runs the full hard-delete cascade, so it takes two
 * clicks: the first only reveals a block listing everything that goes. The
 * per-version "Remove my signature from vX" removes one signature and must say
 * — before anything happens — that the account and everything else stays. The
 * site owner lost her whole account because those two were confused.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mocks = vi.hoisted(() => ({
  deleteMyAccount: vi.fn(),
  removeMySignatureForVersionAction: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ signOut: vi.fn() }) }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/server/actions/account", () => ({
  removeMySignatureForVersionAction: mocks.removeMySignatureForVersionAction,
  updateMyProfileAction: vi.fn(),
}));
vi.mock("@/server/actions/me", () => ({
  deleteMyAccount: mocks.deleteMyAccount,
}));
vi.mock("@/server/actions/why-i-signed", () => ({ saveWhyISigned: vi.fn() }));
vi.mock("@/server/actions/selfie", () => ({ removeMySelfieAction: vi.fn() }));

import AccountClient from "@/app/account/AccountClient";

let container: HTMLDivElement;
let root: Root;

function mount(signatures: { version: string; signedAt: string }[]) {
  container = document.createElement("div");
  document.body.appendChild(container);
  act(() => {
    root = createRoot(container);
    root.render(
      <AccountClient
        initialDisplayName="Alexandra Petrova-Whitfield"
        initialAffiliation={null}
        initialLocationText={null}
        initialWhyISigned={null}
        verificationMethod="email"
        signatures={signatures}
        selfieCard={{ status: "none" }}
      />,
    );
  });
}

function buttonByText(text: string): HTMLButtonElement | null {
  return (
    Array.from(container.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === text,
    ) ?? null
  );
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.click();
  });
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("Delete my account", () => {
  it("needs two clicks, and only the second calls deleteMyAccount", async () => {
    mocks.deleteMyAccount.mockResolvedValue({ success: true });
    mount([{ version: "1.0.0", signedAt: "2026-05-18T00:00:00.000Z" }]);

    expect(buttonByText("Yes, delete everything")).toBeNull();
    await click(buttonByText("Delete my account")!);

    // First click only reveals the confirmation.
    expect(mocks.deleteMyAccount).not.toHaveBeenCalled();
    expect(container.textContent).toContain(
      "Delete your account and everything in it?",
    );
    expect(container.textContent).toContain(
      "Replies other people wrote to your comments are kept.",
    );

    await click(buttonByText("Yes, delete everything")!);
    expect(mocks.deleteMyAccount).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("/");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("Cancel backs out without deleting anything", async () => {
    mount([]);
    await click(buttonByText("Delete my account")!);
    await click(buttonByText("Cancel")!);

    expect(mocks.deleteMyAccount).not.toHaveBeenCalled();
    expect(buttonByText("Yes, delete everything")).toBeNull();
    expect(buttonByText("Delete my account")).not.toBeNull();
  });

  it("shows the error and stays put when the delete fails", async () => {
    mocks.deleteMyAccount.mockResolvedValue({
      success: false,
      error: "Something broke.",
    });
    mount([]);
    await click(buttonByText("Delete my account")!);
    await click(buttonByText("Yes, delete everything")!);

    expect(container.textContent).toContain("Something broke.");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("the revoke link", () => {
  it("says what /account/revoke does and still points there", () => {
    mount([]);
    const link = container.querySelector<HTMLAnchorElement>(
      'a[href="/account/revoke"]',
    );
    expect(link).not.toBeNull();
    expect(link!.textContent).toBe(
      "Revoke consent: anonymize my signature and remove my personal data →",
    );
  });
});

describe("Remove my signature from a version", () => {
  it("confirms that the account stays, and names only that version", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    mount([{ version: "1.0.0", signedAt: "2026-05-18T00:00:00.000Z" }]);

    await click(buttonByText("Remove my signature from v1.0.0")!);

    expect(confirm).toHaveBeenCalledWith(
      "Remove your signature from v1.0.0? Your account, profile, comments and 'why I signed' statement stay, and you can sign again any time.",
    );
    // Declined, so nothing was removed.
    expect(mocks.removeMySignatureForVersionAction).not.toHaveBeenCalled();
  });

  it("adds that other versions' signatures stay when there are some", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mocks.removeMySignatureForVersionAction.mockResolvedValue({
      success: true,
    });
    mount([
      { version: "1.0.0", signedAt: "2026-05-18T00:00:00.000Z" },
      { version: "1.1.0", signedAt: "2026-06-01T00:00:00.000Z" },
    ]);

    await click(buttonByText("Remove my signature from v1.0.0")!);

    expect(confirm).toHaveBeenCalledWith(
      "Remove your signature from v1.0.0? Your account, profile, comments and 'why I signed' statement stay, and you can sign again any time. Your signatures on other versions stay.",
    );
    expect(mocks.removeMySignatureForVersionAction).toHaveBeenCalledWith(
      "1.0.0",
    );
    expect(mocks.deleteMyAccount).not.toHaveBeenCalled();
    expect(buttonByText("Remove my signature from v1.0.0")).toBeNull();
    expect(buttonByText("Remove my signature from v1.1.0")).not.toBeNull();
  });
});
