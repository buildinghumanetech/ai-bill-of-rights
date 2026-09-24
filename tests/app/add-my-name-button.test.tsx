/**
 * @vitest-environment jsdom
 */

/**
 * The quiet "Add my name to v0.1.0" button at the bottom of /v/0.1.0: the only
 * on-site way for an earlier-version signer to sign the new text.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ViewerSignature } from "@/lib/viewer/signature";

const reaffirmMySignature = vi.fn();
const refresh = vi.fn();
const setViewer = vi.fn();
const viewerState: { viewer: ViewerSignature | null } = { viewer: null };

vi.mock("@/server/actions/me", () => ({
  reaffirmMySignature: (...a: unknown[]) => reaffirmMySignature(...a),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/LiveSignersProvider", () => ({
  useOptionalLiveSigners: () => ({ viewer: viewerState.viewer, setViewer }),
}));

import { AddMyNameButton } from "@/app/v/[version]/AddMyNameButton";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const EARLIER: ViewerSignature = {
  signerId: "eeeb0d40-7bee-4bc9-8808-fecb955a8db0",
  signerNumber: 12,
  newVersion: "0.1.0",
};

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  viewerState.viewer = EARLIER;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<AddMyNameButton version="0.1.0" />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

const text = () => container.textContent ?? "";

async function clickAdd() {
  const button = container.querySelector("button")!;
  expect(button.textContent).toBe("Add my name to v0.1.0");
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("Add my name", () => {
  it("signs the new version, confirms it, and drops the what-changed line everywhere", async () => {
    reaffirmMySignature.mockResolvedValue({ success: true });
    await clickAdd();
    expect(reaffirmMySignature).toHaveBeenCalledWith("0.1.0");
    expect(text()).toBe("Your name is on v0.1.0.");
    expect(container.querySelector("button")).toBeNull();
    expect(setViewer).toHaveBeenCalledWith({ ...EARLIER, newVersion: null });
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the server's error and lets them try again", async () => {
    reaffirmMySignature.mockResolvedValue({
      success: false,
      error: "Version 0.1.0 is no longer open for signing.",
    });
    await clickAdd();
    expect(text()).toContain("Version 0.1.0 is no longer open for signing.");
    expect(container.querySelector("button")!.disabled).toBe(false);
    expect(setViewer).not.toHaveBeenCalled();
  });
});
