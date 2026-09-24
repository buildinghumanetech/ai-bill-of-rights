/**
 * @vitest-environment jsdom
 */

/**
 * SignModal must end a signature on the thank-you step — and that step is now
 * built to get the signer to bring two friends.
 *
 * The step is where the signer is thanked, asked why they signed, and handed
 * their share links; it is the whole payoff of signing. It went missing once
 * without any test noticing, so these pin it for each way into a signature:
 * a brand-new signer creating an account, a returning signer signing in by
 * code, and someone already signed in who has not signed yet. On top of that
 * they pin the approved shape of the step: real first name (never the masked
 * public one), number and milestone, "Bring Two Friends.", why BEFORE share,
 * the live card preview, the short link, no selfie, collapsed invites — and
 * that someone who has ALREADY signed lands on share, never on a screen with
 * "Delete my account" on it.
 *
 * Clerk is mocked the way it behaves live: finishing sign-up or sign-in flips
 * useUser().isSignedIn, and SignModal re-fetches the signature status on that
 * flip — by then the signature exists, so the status comes back "signed".
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const SIGNER_ID = "eeeb0d40-7bee-4bc9-8808-fecb955a8db0";
const SLUG = "k7m2p9q";

/** The public display name is masked; the greeting must never use it. */
const MASKED = "A** L*******";

const SIGNED = {
  state: "signed",
  displayName: MASKED,
  verificationMethod: "sms",
  signedAt: "2026-09-24T00:00:00.000Z",
  version: "0.1.0",
  signerId: SIGNER_ID,
  signerNumber: 92,
  whyISigned: null as string | null,
  shareSlug: SLUG as string | null,
};

function clerkError(code: string, message = code) {
  return Object.assign(new Error(message), { errors: [{ code, message }] });
}

const recordSignatureFromModal = vi.fn();
const sendInvitationsAction = vi.fn();
const saveWhyISigned = vi.fn();
const signUpCreate = vi.fn(async () => {});
const preparePhoneNumberVerification = vi.fn(async () => {});
const attemptPhoneNumberVerification = vi.fn(async () => ({
  status: "complete",
  createdSessionId: "sess_new",
}));
const signInCreate = vi.fn(async () => {});
const attemptFirstFactor = vi.fn(async () => ({
  status: "complete",
  createdSessionId: "sess_in",
}));

/** What useUser reports. Flips on when a sign-up or sign-in completes. */
const userState = {
  isSignedIn: false,
  user: null as { firstName: string | null } | null,
};
/** What getMySignatureStatus answers — "signed" once the signature is recorded. */
const statusState: { value: unknown } = { value: { state: "not-signed" } };

const clerkState: {
  session: { id: string } | null;
  client: { activeSessions: Array<{ id: string }> };
} = { session: null, client: { activeSessions: [] } };

function goLive(id: string) {
  clerkState.session = { id };
  userState.isSignedIn = true;
}

const setSignUpActive = vi.fn(async () => goLive("sess_new"));
const setSignInActive = vi.fn(async () => goLive("sess_in"));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({
    signOut: vi.fn(),
    get session() {
      return clerkState.session;
    },
    get client() {
      return clerkState.client;
    },
    setActive: vi.fn(async ({ session }: { session: string }) => goLive(session)),
  }),
  useUser: () => ({ isSignedIn: userState.isSignedIn, user: userState.user }),
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
  createSignerFromModal: vi.fn(),
}));
vi.mock("@/server/actions/invite", () => ({
  sendInvitationsAction: (...a: unknown[]) => sendInvitationsAction(...a),
}));
vi.mock("@/server/actions/me", () => ({
  getMySignatureStatus: vi.fn(async () => statusState.value),
  deleteMyAccount: vi.fn(),
  reaffirmMySignature: vi.fn(),
}));
vi.mock("@/server/actions/why-i-signed", () => ({
  saveWhyISigned: (...a: unknown[]) => saveWhyISigned(...a),
}));
// A visible stand-in, so "the selfie is hidden" is something a test can see.
vi.mock("@/components/SelfieCapture", () => ({
  SelfieCapture: () => <div data-testid="selfie-capture">selfie</div>,
}));

import SignModal, { inviteSummary, signerGreeting } from "@/app/SignModal";

let container: HTMLDivElement;
let root: Root;
const onClose = vi.fn();

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

beforeEach(() => {
  userState.isSignedIn = false;
  userState.user = null;
  statusState.value = { state: "not-signed" };
  clerkState.session = null;
  clerkState.client = { activeSessions: [] };
  recordSignatureFromModal.mockImplementation(async () => {
    statusState.value = SIGNED;
    return { success: true, signerId: SIGNER_ID, displayName: MASKED };
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

function type(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
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

async function open() {
  await act(async () => {
    root.render(<SignModal open onClose={onClose} mode="sign" />);
  });
}

async function fillAndSubmitSignForm(firstName = "Ada") {
  await act(async () => {
    type(input("First name"), firstName);
    type(input("Last name"), "Lovelace");
    type(input("555 123 4567"), "5551234567");
  });
  await submitFormOf(input("First name"));
}

async function enterCode() {
  const codeInput = input("123456");
  await act(async () => type(codeInput, "123456"));
  await submitFormOf(codeInput);
}

const text = () => container.textContent ?? "";
const heading = () => container.querySelector("#sign-modal-title")?.textContent;
const cardImg = () =>
  container.querySelector<HTMLImageElement>('img[src^="/api/og/signer/"]');
const shareInput = () =>
  container.querySelector<HTMLInputElement>("#share-url-input")!;

function expectThankYouStep() {
  expect(recordSignatureFromModal).toHaveBeenCalledTimes(1);
  // Real first name, number — never the masked display name.
  expect(heading()).toBe("Ada, you're signer #92.");
  expect(text()).not.toContain(MASKED);
  // The rest of the step, not just its heading: the why-I-signed prompt.
  expect(container.querySelector("#why-i-signed-input")).not.toBeNull();
  // And not the "already signed" view that used to sit on the form step.
  expect(text()).not.toMatch(/already signed/i);
  expect(onClose).not.toHaveBeenCalled();
}

describe("signing ends on the thank-you step", () => {
  it("for a brand-new signer who creates an account", async () => {
    await open();
    await fillAndSubmitSignForm();
    await enterCode();
    expectThankYouStep();
  });

  it("for a returning signer whose number already has an account", async () => {
    signUpCreate.mockRejectedValueOnce(clerkError("form_identifier_exists"));
    await open();
    await fillAndSubmitSignForm();
    expect(signInCreate).toHaveBeenCalled();
    await enterCode();
    expectThankYouStep();
  });

  it("for someone already signed in who hasn't signed yet", async () => {
    goLive("sess_existing");
    await open();
    await fillAndSubmitSignForm();
    expectThankYouStep();
  });
});

describe("the thank-you step", () => {
  async function signAsNew() {
    await open();
    await fillAndSubmitSignForm();
    await enterCode();
  }

  it("leads with the milestone and the ask", async () => {
    await signAsNew();
    expect(text()).toContain("8 more to reach 100.");
    expect(text()).toContain("Bring Two Friends.");
    expect(text()).toContain("Who else should be on this list?");
  });

  it("asks why before offering share, and shows no selfie step", async () => {
    await signAsNew();
    const why = container.querySelector("#why-i-signed-input")!;
    const share = shareInput();
    // why precedes share in document order
    expect(
      why.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(text()).toMatch(/Why did you sign\?\s*\(optional\)/);
    expect(container.querySelector('[data-testid="selfie-capture"]')).toBeNull();
    expect(text()).not.toMatch(/selfie/i);
  });

  it("previews their real card and shares the short link, with no raw id", async () => {
    await signAsNew();
    expect(cardImg()?.getAttribute("src")).toBe(
      `/api/og/signer/${SIGNER_ID}?v=`,
    );
    expect(shareInput().value).toBe(`${window.location.origin}/s/${SLUG}?via=copy`);
    expect(text()).not.toContain(SIGNER_ID);
  });

  it("refreshes the card and the message as soon as a why is saved", async () => {
    const WHY = "Because my kids will grow up with this.";
    saveWhyISigned.mockResolvedValue({ success: true, whyISigned: WHY });
    await signAsNew();
    const box = container.querySelector<HTMLTextAreaElement>(
      "#why-i-signed-input",
    )!;
    await act(async () => type(box, WHY));
    await click(button("Add to my card"));
    expect(cardImg()?.getAttribute("src")).toBe(
      `/api/og/signer/${SIGNER_ID}?v=${encodeURIComponent(WHY)}`,
    );
    expect(text()).toContain(WHY);
    expect(text()).toContain("Saved");
  });

  it("falls back to the long link when there is no slug (migration 0014 unapplied)", async () => {
    recordSignatureFromModal.mockImplementation(async () => {
      statusState.value = { ...SIGNED, shareSlug: null };
      return { success: true, signerId: SIGNER_ID, displayName: MASKED };
    });
    await signAsNew();
    expect(shareInput().value).toBe(
      `${window.location.origin}/signatories/${SIGNER_ID}?ref=${SIGNER_ID}&via=copy`,
    );
  });

  it("keeps invites collapsed under share and reports sends and skips", async () => {
    sendInvitationsAction.mockResolvedValue({
      sent: ["a@x.org", "b@x.org", "c@x.org"],
      skipped: [
        { email: "d@x.org", reason: "already-signed" },
        { email: "e@x.org", reason: "already-invited" },
      ],
      failed: [],
    });
    await signAsNew();
    const details = container.querySelector("details")!;
    expect(details.open).toBe(false);
    expect(details.textContent).toContain("Invite people by email");
    expect(
      shareInput().compareDocumentPosition(details) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    details.open = true;
    const field = input("someone@example.com");
    await act(async () => type(field, "a@x.org"));
    await click(button("Send invitations"));
    expect(text()).toContain("Sent to 3 people.");
    expect(text()).toContain("Skipped d@x.org — already signed");
    expect(text()).toContain("Skipped e@x.org — already invited");
  });
});

describe("someone who has already signed", () => {
  it("lands on share with their why — no delete or sign-out buttons", async () => {
    goLive("sess_existing");
    userState.user = { firstName: "Ada" };
    statusState.value = { ...SIGNED, whyISigned: "It matters." };
    await open();
    expect(heading()).toBe("Ada, you're signer #92.");
    expect(container.querySelector<HTMLTextAreaElement>("#why-i-signed-input")!.value).toBe(
      "It matters.",
    );
    expect(shareInput().value).toContain(`/s/${SLUG}`);
    expect(text()).not.toMatch(/Delete my account|Yes, delete everything|Sign out/);
    expect(recordSignatureFromModal).not.toHaveBeenCalled();
  });
});

describe("someone who signed an earlier version", () => {
  const SIGNED_EARLIER = {
    ...SIGNED,
    state: "signed-earlier",
    version: "0.0.1",
    requestedVersion: "0.1.0",
    firstSignedAt: "2026-06-01T00:00:00.000Z",
    firstVersion: "0.0.1",
  };
  const whatChanged = () =>
    [...container.querySelectorAll("a")].find(
      (a) => a.textContent === "See what changed",
    );

  it("lands on share, with an optional link to what changed and no way to re-sign here", async () => {
    goLive("sess_existing");
    userState.user = { firstName: "Ada" };
    statusState.value = SIGNED_EARLIER;
    await open();
    expect(heading()).toBe("Ada, you're signer #92.");
    expect(shareInput().value).toContain(`/s/${SLUG}`);
    expect(text()).toContain("v0.1.0 is out. See what changed.");
    expect(whatChanged()?.getAttribute("href")).toBe("/v/0.1.0#what-changed");
    // Re-signing lives only at the bottom of /v/0.1.0.
    expect(text()).not.toMatch(/already signed|Add my name/i);
    expect(recordSignatureFromModal).not.toHaveBeenCalled();
  });

  it("lands on share after filling in the sign form, and is not signed again", async () => {
    signUpCreate.mockRejectedValueOnce(clerkError("form_identifier_exists"));
    // Two things can get them to share: the status fetch that follows the
    // sign-in, and the action's alreadySigned answer. Whichever lands first,
    // they must end on share, never on an error or a second signature.
    statusState.value = { state: "anonymous" };
    recordSignatureFromModal.mockImplementation(async () => {
      statusState.value = SIGNED_EARLIER;
      return {
        success: false,
        alreadySigned: true,
        error: "You've already signed the AI Bill of Rights.",
      };
    });
    await open();
    await fillAndSubmitSignForm();
    await enterCode();
    expect(heading()).toBe("Ada, you're signer #92.");
    expect(text()).toContain("v0.1.0 is out. See what changed.");
    expect(text()).not.toMatch(/already signed/i);
  });

  it.each(["signed-other", "signed-version-unknown"])(
    "lands on share with no what-changed link when there is no newer version to sign (%s)",
    async (state) => {
      goLive("sess_existing");
      userState.user = { firstName: "Ada" };
      statusState.value = { ...SIGNED, state, requestedVersion: "0.1.0" };
      await open();
      expect(heading()).toBe("Ada, you're signer #92.");
      expect(whatChanged()).toBeUndefined();
      expect(text()).not.toMatch(/Add my name|Manage my signature/);
    },
  );

  it("shows a signer of the current version no what-changed link", async () => {
    goLive("sess_existing");
    userState.user = { firstName: "Ada" };
    statusState.value = SIGNED;
    await open();
    expect(heading()).toBe("Ada, you're signer #92.");
    expect(whatChanged()).toBeUndefined();
  });
});

describe("copy helpers", () => {
  it("greets by real first name, or plainly when there is none", () => {
    expect(signerGreeting("Ada", 92)).toBe("Ada, you're signer #92.");
    expect(signerGreeting("  Ada  Byron ", 1_204)).toBe("Ada, you're signer #1,204.");
    expect(signerGreeting("", 92)).toBe("You're signer #92.");
    expect(signerGreeting("Ada", null)).toBe("Thank you for signing, Ada.");
  });

  it("counts people, not addresses tried", () => {
    expect(inviteSummary(3)).toBe("Sent to 3 people.");
    expect(inviteSummary(1)).toBe("Sent to 1 person.");
    expect(inviteSummary(0)).toBe("No new invitations sent.");
  });
});
