// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";

type SubmitResult = { ok: boolean; id?: string; error?: string; code?: string };
const submitNewRightAction = vi.fn<(fd: FormData) => Promise<SubmitResult>>(
  async () => ({ ok: true, id: "p1" }),
);

const clerk = vi.hoisted(() => ({
  isSignedIn: true as boolean,
  email: "someone@example.org" as string | null,
  signOut: vi.fn(async (_opts?: { redirectUrl?: string }) => {}),
}));

vi.mock("@/server/actions/proposals", () => ({
  submitNewRightAction: (fd: FormData) => submitNewRightAction(fd),
}));
vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: clerk.isSignedIn }),
  useUser: () => ({
    user: clerk.isSignedIn && clerk.email
      ? { primaryEmailAddress: { emailAddress: clerk.email }, primaryPhoneNumber: null }
      : null,
  }),
  useClerk: () => ({ signOut: clerk.signOut }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ProposeRightForm } from "@/components/ProposeRightForm";

beforeEach(() => {
  clerk.isSignedIn = true;
  clerk.email = "someone@example.org";
  window.sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  clerk.signOut.mockClear();
  submitNewRightAction.mockReset();
  submitNewRightAction.mockImplementation(async () => ({ ok: true, id: "p1" }));
});

type Opened = { mode?: string; signIn?: boolean };
function captureSignModalOpens() {
  const opened: Opened[] = [];
  const onOpen = (e: Event) =>
    opened.push({ ...((e as CustomEvent<Opened | undefined>).detail ?? {}) });
  window.addEventListener("open-sign-modal", onOpen);
  return { opened, stop: () => window.removeEventListener("open-sign-modal", onOpen) };
}

const TITLE = "Your Mind Is Not a Customer";
function fillValidProposal() {
  const [title] = screen.getAllByRole("textbox");
  fireEvent.change(title, { target: { value: TITLE } });
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

function expectBeforeFirstField(el: HTMLElement) {
  const firstField = screen.getAllByRole("textbox")[0];
  expect(el.compareDocumentPosition(firstField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe("ProposeRightForm: signed out", () => {
  it("says 'not signed in' up front and offers sign-in, without claiming they haven't signed", () => {
    clerk.isSignedIn = false;
    const opens = captureSignModalOpens();
    render(<ProposeRightForm />);

    const notice = screen.getByRole("status");
    expect(notice.textContent).toMatch(/not signed in/i);
    expect(notice.textContent).not.toMatch(/hasn.t signed/i);
    expectBeforeFirstField(notice);

    fireEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(opens.opened).toEqual([{ mode: "comment-only", signIn: true }]);

    // And a way to sign for anyone who hasn't.
    fireEvent.click(screen.getByRole("button", { name: /sign the bill of rights/i }));
    expect(opens.opened[1]).toEqual({ mode: "sign" });
    opens.stop();
  });

  it("submitting while signed out opens sign-in, not create-account", async () => {
    clerk.isSignedIn = false;
    const opens = captureSignModalOpens();
    render(<ProposeRightForm />);
    fillValidProposal();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /file this proposal/i }));
    });
    expect(opens.opened).toEqual([{ mode: "comment-only", signIn: true }]);
    expect(submitNewRightAction).not.toHaveBeenCalled();
    opens.stop();
  });
});

describe("ProposeRightForm: signed in without a signer row", () => {
  it("names the account, asks them to sign, and offers switching account", async () => {
    const opens = captureSignModalOpens();
    render(<ProposeRightForm needsSignature />);

    const notice = screen.getByRole("status");
    expect(notice.textContent).toMatch(/signed in as someone@example\.org/i);
    expect(notice.textContent).toMatch(/hasn.t signed the bill of rights/i);
    expectBeforeFirstField(notice);

    fireEvent.click(screen.getByRole("button", { name: /sign the bill of rights/i }));
    expect(opens.opened).toEqual([{ mode: "sign" }]);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /switch account/i }));
    });
    expect(clerk.signOut).toHaveBeenCalledWith({ redirectUrl: "/propose" });
    opens.stop();
  });
});

describe("ProposeRightForm: signer", () => {
  it("shows no gate notice", () => {
    render(<ProposeRightForm />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("ProposeRightForm: server refusals are never a dead end", () => {
  it.each([
    ["not_signed_in", /^sign in$/i, { mode: "comment-only", signIn: true }],
    ["not_signer", /sign the bill of rights/i, { mode: "sign" }],
  ] as const)("%s shows its own action and keeps the text", async (code, name, detail) => {
    submitNewRightAction.mockImplementation(async () => ({ ok: false, code, error: "Refused." }));
    const opens = captureSignModalOpens();
    render(<ProposeRightForm />);
    fillValidProposal();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /file this proposal/i }));
    });

    fireEvent.click(screen.getByRole("button", { name }));
    expect(opens.opened).toEqual([detail]);
    expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toBe(TITLE);
    opens.stop();
  });
});

describe("ProposeRightForm: draft survives a reload", () => {
  it("restores what was typed after a remount, and clears it once filed", async () => {
    clerk.isSignedIn = false;
    const first = render(<ProposeRightForm />);
    fillValidProposal();
    first.unmount();

    clerk.isSignedIn = true;
    render(<ProposeRightForm />);
    expect((screen.getAllByRole("textbox")[0] as HTMLInputElement).value).toBe(TITLE);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /file this proposal/i }));
    });
    expect(submitNewRightAction).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem("propose-right-draft")).toBeNull();
  });
});
