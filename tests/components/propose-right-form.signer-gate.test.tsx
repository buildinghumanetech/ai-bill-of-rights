// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";

type SubmitResult = { ok: boolean; id?: string; error?: string; code?: string };
const submitNewRightAction = vi.fn<(fd: FormData) => Promise<SubmitResult>>(
  async () => ({ ok: true, id: "p1" }),
);

vi.mock("@/server/actions/proposals", () => ({
  submitNewRightAction: (fd: FormData) => submitNewRightAction(fd),
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: true }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ProposeRightForm } from "@/components/ProposeRightForm";

afterEach(() => {
  cleanup();
  submitNewRightAction.mockReset();
  submitNewRightAction.mockImplementation(async () => ({ ok: true, id: "p1" }));
});

function captureSignModalOpens() {
  const modes: Array<string | undefined> = [];
  const onOpen = (e: Event) =>
    modes.push((e as CustomEvent<{ mode?: string } | undefined>).detail?.mode);
  window.addEventListener("open-sign-modal", onOpen);
  return { modes, stop: () => window.removeEventListener("open-sign-modal", onOpen) };
}

function fillValidProposal() {
  const [title] = screen.getAllByRole("textbox");
  fireEvent.change(title, { target: { value: "Your Mind Is Not a Customer" } });
  const textareas = screen.getAllByRole("textbox").filter((el) => el.tagName === "TEXTAREA");
  fireEvent.change(textareas[0], {
    target: {
      value:
        "No AI system may present uncertain knowledge with false confidence, or substitute fluent answers for the work of understanding.",
    },
  });
  fireEvent.change(textareas[1], {
    target: { value: "Article 4 covers acting against you; this covers deskilling." },
  });
}

describe("ProposeRightForm signer gate", () => {
  it("states the signer requirement BEFORE the compose box, with a way to sign", () => {
    const opens = captureSignModalOpens();
    render(<ProposeRightForm needsSignature />);

    const notice = screen.getByRole("status");
    expect(notice.textContent).toMatch(/only signers can file/i);

    // Above the first field, not after the whole proposal has been written.
    const firstField = screen.getAllByRole("textbox")[0];
    expect(
      notice.compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /sign the bill of rights/i }));
    expect(opens.modes).toEqual(["sign"]);
    opens.stop();
  });

  it("shows no up-front notice to someone who is already a signer", () => {
    render(<ProposeRightForm />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: /sign the bill of rights/i })).toBeNull();
  });

  it("turns a not-a-signer rejection into an actionable prompt, keeping the text", async () => {
    submitNewRightAction.mockImplementation(async () => ({
      ok: false,
      code: "not_signer",
      error: "Only signers can file a proposal.",
    }));
    const opens = captureSignModalOpens();
    render(<ProposeRightForm />);
    fillValidProposal();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /file this proposal/i }));
    });

    const cta = screen.getByRole("button", { name: /sign the bill of rights/i });
    fireEvent.click(cta);
    expect(opens.modes).toEqual(["sign"]);
    // The proposal is still there to file once they have signed.
    expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toBe(
      "Your Mind Is Not a Customer",
    );
    opens.stop();
  });
});
