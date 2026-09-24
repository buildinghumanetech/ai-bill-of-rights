/**
 * @vitest-environment jsdom
 */

/**
 * The Delete and Anonymize buttons on /admin/signers: each one confirms in
 * its own words, names the signer, and calls its own action.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const deleteSignerAction = vi.fn(async () => ({ success: true }));
const anonymizeSignerAction = vi.fn(async () => ({ success: true }));

vi.mock("@/server/actions/admin", () => ({
  deleteSignerAction: (...a: unknown[]) =>
    (deleteSignerAction as unknown as (...x: unknown[]) => unknown)(...a),
  anonymizeSignerAction: (...a: unknown[]) =>
    (anonymizeSignerAction as unknown as (...x: unknown[]) => unknown)(...a),
  setAdminFlagAction: vi.fn(async () => ({ success: true })),
}));
vi.mock("@/app/admin/signers/AdminEditSignerModal", () => ({ default: () => null }));

import AdminRowActions from "@/app/admin/signers/AdminRowActions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const SIGNER_ID = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";

let container: HTMLDivElement;
let root: Root;
let confirmSpy: MockInstance<(message?: string) => boolean>;

beforeEach(async () => {
  confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <AdminRowActions
        signerId={SIGNER_ID}
        displayName="Test Signer 91"
        affiliation={null}
        locationText={null}
        isAdmin={false}
      />,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  confirmSpy.mockRestore();
  vi.clearAllMocks();
});

async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`no button "${label}"`);
  await act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("Delete", () => {
  it("warns it is permanent, names the signer, and deletes", async () => {
    await click("Delete");
    const message = String(confirmSpy.mock.calls[0][0]);
    expect(message).toContain("Permanently delete Test Signer 91?");
    expect(message).toContain("cannot be undone");
    expect(deleteSignerAction).toHaveBeenCalledWith(SIGNER_ID);
    expect(anonymizeSignerAction).not.toHaveBeenCalled();
  });

  it("does nothing when the confirm is cancelled", async () => {
    confirmSpy.mockReturnValue(false);
    await click("Delete");
    expect(deleteSignerAction).not.toHaveBeenCalled();
  });
});

describe("Anonymize", () => {
  it("says the signature is kept, names the signer, and anonymizes", async () => {
    await click("Anonymize");
    const message = String(confirmSpy.mock.calls[0][0]);
    expect(message).toContain("Anonymize Test Signer 91?");
    expect(message).toContain("Their signature and the public count are kept.");
    expect(anonymizeSignerAction).toHaveBeenCalledWith(SIGNER_ID);
    expect(deleteSignerAction).not.toHaveBeenCalled();
  });
});
