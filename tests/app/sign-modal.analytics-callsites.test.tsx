/**
 * @vitest-environment jsdom
 */

/**
 * SignModal's analytics CALL SITES, as opposed to the pure builders every
 * other test in this suite covers.
 *
 * `signature_completed` is the conversion event — the denominator of every
 * ratio the referral work exists to produce — and it is fired from TWO places:
 * the already-signed-in shortcut in `handleFormSubmit`, and the post-OTP path
 * in `handleCodeSubmit`. Deleting either call leaves the rest of the suite
 * green, because everything else here tests pure functions.
 *
 * The copy button is here for the same reason: whether `share_clicked` is
 * reported before or after `navigator.clipboard.writeText` resolves is
 * invisible to any pure-function test, and getting it wrong records shares
 * that never happened.
 *
 * So this file renders the real component and drives the real paths. It is the
 * only DOM test in the suite; the docblock above opts just this file into
 * jsdom rather than moving the whole config off `node`.
 *
 * The analytics sink is the real `track()` pipeline with `setAnalyticsSink`
 * pointed at an array — not a mock of the tracker — so a call that goes to the
 * wrong helper, or gets its payload stripped by `clean()`, still shows up here.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  ANALYTICS_EVENTS,
  setAnalyticsSink,
  type AnalyticsProps,
} from "@/lib/analytics/track";

const SIGNER_ID = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";

const recordSignatureFromModal = vi.fn();
const setSignUpActive = vi.fn(async () => {});
const signUpCreate = vi.fn(async () => {});
const preparePhoneNumberVerification = vi.fn(async () => {});
const attemptPhoneNumberVerification = vi.fn(async () => ({
  status: "complete",
  createdSessionId: "sess_1",
}));

/** Flipped per-test so one mock module can serve both success paths. */
let signedIn = false;

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ signOut: vi.fn() }),
  useUser: () => ({ isSignedIn: signedIn, user: {} }),
  useSignUp: () => ({
    isLoaded: true,
    setActive: setSignUpActive,
    signUp: {
      create: signUpCreate,
      preparePhoneNumberVerification,
      attemptPhoneNumberVerification,
    },
  }),
  useSignIn: () => ({ isLoaded: true, setActive: vi.fn(), signIn: {} }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/server/actions/sign-from-modal", () => ({
  recordSignatureFromModal: (...args: unknown[]) =>
    recordSignatureFromModal(...args),
  createSignerFromModal: vi.fn(),
}));
vi.mock("@/server/actions/invite", () => ({ sendInvitationsAction: vi.fn() }));
vi.mock("@/server/actions/me", () => ({
  getMySignatureStatus: vi.fn(async () => ({ state: "not-signed" })),
  removeMySignature: vi.fn(),
}));
vi.mock("@/server/actions/why-i-signed", () => ({ saveWhyISigned: vi.fn() }));
vi.mock("@/components/SelfieCapture", () => ({ SelfieCapture: () => null }));

import SignModal from "@/app/SignModal";

type Captured = [string, AnalyticsProps | undefined];

let events: Captured[];
let container: HTMLDivElement;
let root: Root;

// React 19 requires this before act() will flush effects.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

beforeEach(() => {
  events = [];
  setAnalyticsSink((name, props) => events.push([name, props]));
  recordSignatureFromModal.mockResolvedValue({
    success: true,
    signerId: SIGNER_ID,
    displayName: "Ada Lovelace",
    referred: true,
    channel: "linkedin",
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  setAnalyticsSink(null);
  vi.clearAllMocks();
  signedIn = false;
});

/** Controlled React inputs only see a value set through the native setter. */
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

function submitFormOf(el: HTMLElement): Promise<void> {
  const form = el.closest("form");
  if (!form) throw new Error("input is not inside a form");
  return act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function openModal(): Promise<void> {
  await act(async () => {
    root.render(<SignModal open onClose={() => {}} />);
  });
}

async function fillTheForm(): Promise<void> {
  await act(async () => {
    type(input("First name"), "Ada");
    type(input("Last name"), "Lovelace");
    type(input("555 123 4567"), "5551234567");
  });
}

const completions = () =>
  events.filter(([name]) => name === ANALYTICS_EVENTS.signatureCompleted);

const shares = () =>
  events.filter(([name]) => name === ANALYTICS_EVENTS.shareClicked);

function button(label: string): HTMLButtonElement {
  const el = [...container.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!el) throw new Error(`no button labelled "${label}"`);
  return el as HTMLButtonElement;
}

/** Drive the signed-in path all the way to the post-signature share step. */
async function signToDoneStep(): Promise<void> {
  signedIn = true;
  await openModal();
  await fillTheForm();
  await submitFormOf(input("First name"));
}

describe("signature_completed fires from both SignModal success paths", () => {
  it("fires exactly once on the already-signed-in path (no OTP)", async () => {
    signedIn = true;
    await openModal();
    await fillTheForm();
    await submitFormOf(input("First name"));

    expect(recordSignatureFromModal).toHaveBeenCalledTimes(1);
    expect(completions()).toHaveLength(1);
    // The two facets that make the funnel joinable, straight off the server
    // action's result — the browser cannot work them out for itself.
    expect(completions()[0][1]).toMatchObject({
      method: "phone",
      referred: true,
      channel: "linkedin",
    });
  });

  it("fires exactly once on the OTP path", async () => {
    signedIn = false;
    await openModal();
    await fillTheForm();
    await submitFormOf(input("First name"));

    // We should now be on the code step, with nothing reported yet: the
    // signature does not exist until the server action has run.
    const codeInput = input("123456");
    expect(completions()).toHaveLength(0);

    await act(async () => type(codeInput, "123456"));
    await submitFormOf(codeInput);

    expect(recordSignatureFromModal).toHaveBeenCalledTimes(1);
    expect(completions()).toHaveLength(1);
    expect(completions()[0][1]).toMatchObject({
      method: "phone",
      referred: true,
      channel: "linkedin",
    });
  });

  it("reports nothing when the server action rejects the signature", async () => {
    signedIn = true;
    recordSignatureFromModal.mockResolvedValue({
      success: false,
      error: "nope",
    });
    await openModal();
    await fillTheForm();
    await submitFormOf(input("First name"));

    expect(recordSignatureFromModal).toHaveBeenCalledTimes(1);
    expect(completions()).toHaveLength(0);
  });
});

describe("the copy button only reports a share that happened", () => {
  function stubClipboard(writeText: () => Promise<void>) {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(writeText) },
    });
  }

  async function clickCopy(): Promise<void> {
    await act(async () => {
      button("Copy").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("reports share_clicked{copy} once the clipboard write resolves", async () => {
    stubClipboard(async () => {});
    await signToDoneStep();
    await clickCopy();

    expect(shares()).toEqual([
      [ANALYTICS_EVENTS.shareClicked, { channel: "copy", surface: "post-sign" }],
    ]);
  });

  it("reports nothing when the clipboard write is refused", async () => {
    // Insecure context, or the user denying the permission. The invite path
    // next to it already guards on "a send that actually left the building";
    // a rejected write is the same thing — no share happened, so no share is
    // reported.
    stubClipboard(async () => {
      throw new Error("NotAllowedError");
    });
    await signToDoneStep();
    await clickCopy();

    expect(shares()).toEqual([]);
  });
});
