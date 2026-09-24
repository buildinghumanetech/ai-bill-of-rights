/**
 * @vitest-environment jsdom
 */

/**
 * SignModal for people who ALREADY have an account.
 *
 * The first end-to-end run of /propose ended on a red "Session already exists"
 * under "Confirm & create account": the modal always ran sign-UP, and Clerk
 * refuses to start or finish a sign-up while the browser already holds a
 * session. These tests pin the two halves of the fix:
 *
 *  - `session_exists` from ANY Clerk call is recovered — the existing session is
 *    adopted and the flow finishes as that person — and never shown as an error;
 *  - a returning visitor can choose "Sign in" and is asked for their phone or
 *    email only, never for a name and preferences we already hold.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const SIGNER_ID = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";

function clerkError(code: string, message = code) {
  return Object.assign(new Error(message), { errors: [{ code, message }] });
}

const createSignerFromModal = vi.fn();
const recordSignatureFromModal = vi.fn();
const signUpCreate = vi.fn(async () => {});
const preparePhoneNumberVerification = vi.fn(async () => {});
const attemptPhoneNumberVerification = vi.fn(async () => ({
  status: "complete",
  createdSessionId: "sess_new",
}));
const setSignUpActive = vi.fn(async () => {
  clerkState.session = { id: "sess_new" };
});
const signInCreate = vi.fn(async () => {});
const attemptFirstFactor = vi.fn(async () => ({
  status: "complete",
  createdSessionId: "sess_in",
}));
const setSignInActive = vi.fn(async () => {
  clerkState.session = { id: "sess_in" };
});
const clerkSetActive = vi.fn(async ({ session }: { session: string }) => {
  clerkState.session = { id: session };
});

/** Mutable stand-in for the Clerk singleton; reset in beforeEach. */
const clerkState: {
  session: { id: string } | null;
  client: { activeSessions: Array<{ id: string }> };
} = { session: null, client: { activeSessions: [] } };

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({
    signOut: vi.fn(),
    get session() {
      return clerkState.session;
    },
    get client() {
      return clerkState.client;
    },
    setActive: clerkSetActive,
  }),
  useUser: () => ({ isSignedIn: false, user: null }),
  useSignUp: () => ({
    isLoaded: true,
    setActive: setSignUpActive,
    signUp: {
      create: signUpCreate,
      preparePhoneNumberVerification,
      attemptPhoneNumberVerification,
    },
  }),
  useSignIn: () => ({
    isLoaded: true,
    setActive: setSignInActive,
    signIn: { create: signInCreate, attemptFirstFactor },
  }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/server/actions/sign-from-modal", () => ({
  recordSignatureFromModal: (...a: unknown[]) => recordSignatureFromModal(...a),
  createSignerFromModal: (...a: unknown[]) => createSignerFromModal(...a),
}));
vi.mock("@/server/actions/invite", () => ({ sendInvitationsAction: vi.fn() }));
vi.mock("@/server/actions/me", () => ({
  getMySignatureStatus: vi.fn(async () => ({ state: "not-signed" })),
  removeMySignature: vi.fn(),
  reaffirmMySignature: vi.fn(),
}));
vi.mock("@/server/actions/why-i-signed", () => ({ saveWhyISigned: vi.fn() }));
vi.mock("@/components/SelfieCapture", () => ({ SelfieCapture: () => null }));

import SignModal from "@/app/SignModal";

let container: HTMLDivElement;
let root: Root;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

beforeEach(() => {
  clerkState.session = null;
  clerkState.client = { activeSessions: [] };
  createSignerFromModal.mockResolvedValue({
    success: true,
    signerId: SIGNER_ID,
    displayName: "Ada Lovelace",
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function type(el: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function input(placeholder: string): HTMLInputElement {
  const el = container.querySelector<HTMLInputElement>(
    `input[placeholder="${placeholder}"]`,
  );
  if (!el) throw new Error(`no input with placeholder "${placeholder}"`);
  return el;
}

function button(label: string): HTMLButtonElement {
  const el = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!el) throw new Error(`no button labelled "${label}"`);
  return el as HTMLButtonElement;
}

async function click(el: HTMLElement) {
  await act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function submitFormOf(el: HTMLElement) {
  const form = el.closest("form")!;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function openCommentOnly() {
  await act(async () => {
    root.render(<SignModal open onClose={() => {}} mode="comment-only" />);
  });
}

async function fillCreateForm() {
  await act(async () => {
    type(input("First name"), "Ada");
    type(input("Last name"), "Lovelace");
    type(input("555 123 4567"), "5551234567");
  });
}

async function enterCode() {
  const codeInput = input("123456");
  await act(async () => type(codeInput, "123456"));
  await submitFormOf(codeInput);
}

const text = () => container.textContent ?? "";

describe("session_exists is recovered, never shown", () => {
  it("at the code step: adopts the existing session and finishes", async () => {
    attemptPhoneNumberVerification.mockRejectedValueOnce(
      clerkError("session_exists", "Session already exists"),
    );
    clerkState.client = { activeSessions: [{ id: "sess_old" }] };

    await openCommentOnly();
    await fillCreateForm();
    await submitFormOf(input("First name"));
    await enterCode();

    expect(text()).not.toContain("Session already exists");
    expect(clerkSetActive).toHaveBeenCalledWith({ session: "sess_old" });
    expect(createSignerFromModal).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Account created");
  });

  it("when starting the sign-up: skips straight to finishing", async () => {
    signUpCreate.mockRejectedValueOnce(
      clerkError("session_exists", "Session already exists"),
    );
    clerkState.client = { activeSessions: [{ id: "sess_old" }] };

    await openCommentOnly();
    await fillCreateForm();
    await submitFormOf(input("First name"));

    expect(text()).not.toContain("Session already exists");
    expect(preparePhoneNumberVerification).not.toHaveBeenCalled();
    expect(createSignerFromModal).toHaveBeenCalledTimes(1);
  });

  it("a second Confirm after the session went live does not re-verify", async () => {
    // First press verifies and activates the session, then the server action
    // fails. The retry used to re-run verification and got session_exists.
    createSignerFromModal.mockResolvedValueOnce({ success: false, error: "db blip" });

    await openCommentOnly();
    await fillCreateForm();
    await submitFormOf(input("First name"));
    await enterCode();
    expect(text()).toContain("db blip");

    await submitFormOf(input("123456"));

    expect(attemptPhoneNumberVerification).toHaveBeenCalledTimes(1);
    expect(createSignerFromModal).toHaveBeenCalledTimes(2);
    expect(text()).toContain("Account created");
  });

  it("a session already on the browser skips the sign-up entirely", async () => {
    clerkState.session = { id: "sess_live" };

    await openCommentOnly();
    await fillCreateForm();
    await submitFormOf(input("First name"));

    expect(signUpCreate).not.toHaveBeenCalled();
    expect(createSignerFromModal).toHaveBeenCalledTimes(1);
  });
});

describe("returning visitor can just sign in", () => {
  it("asks only for the phone number and signs in by code", async () => {
    await openCommentOnly();
    await click(button("Sign in"));

    expect(container.querySelector('input[placeholder="First name"]')).toBeNull();
    await act(async () => type(input("555 123 4567"), "5551234567"));
    await submitFormOf(input("555 123 4567"));

    expect(signUpCreate).not.toHaveBeenCalled();
    expect(signInCreate).toHaveBeenCalledWith({
      identifier: "+15551234567",
      strategy: "phone_code",
    });
    expect(text()).toContain("Enter the code to sign in");

    await enterCode();

    expect(attemptFirstFactor).toHaveBeenCalledWith({
      strategy: "phone_code",
      code: "123456",
    });
    expect(createSignerFromModal).toHaveBeenCalledTimes(1);
    expect(text()).toContain("You're signed in, Ada.");
    // A returning visitor may well have signed already; nothing we can read
    // reliably here says which, so the closing line must be true either way.
    expect(text()).not.toMatch(/you can sign the ai bill of rights/i);
    expect(text()).toContain("Your account page shows your signature status and settings.");
  });

  it("an unknown number is sent to create-account, not an error wall", async () => {
    signInCreate.mockRejectedValueOnce(clerkError("form_identifier_not_found"));

    await openCommentOnly();
    await click(button("Sign in"));
    await act(async () => type(input("555 123 4567"), "5551234567"));
    await submitFormOf(input("555 123 4567"));

    expect(text()).toContain("No account uses that number yet");
    // The name fields are back so they can finish creating one.
    expect(input("First name")).toBeTruthy();
  });

  it("the create-account path still falls through to sign-in for a known number", async () => {
    signUpCreate.mockRejectedValueOnce(
      clerkError("form_identifier_exists__phone_number"),
    );

    await openCommentOnly();
    await fillCreateForm();
    await submitFormOf(input("First name"));

    expect(signInCreate).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Enter the code to sign in");
    expect(button("Sign in")).toBeTruthy();
  });
});
