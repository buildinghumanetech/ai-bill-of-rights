"use client";

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk, useSignIn, useSignUp, useUser } from "@clerk/nextjs";
import {
  recordSignatureFromModal,
  createSignerFromModal,
} from "@/server/actions/sign-from-modal";
import {
  sendInvitationsAction,
  type InvitationResult,
} from "@/server/actions/invite";
import {
  getMySignatureStatus,
  type SignatureStatus,
} from "@/server/actions/me";
import { saveWhyISigned } from "@/server/actions/why-i-signed";
import { useOptionalLiveSigners } from "./LiveSignersProvider";
import { NewVersionLink } from "@/components/SignatureMomentum";
import { SelfieCapture } from "@/components/SelfieCapture";
import { MAX_WHY_I_SIGNED_LENGTH } from "@/lib/why-i-signed";
import { buildShareText } from "@/lib/share/share-text";
import { shareHrefs, signerShareLink, type ShareChannel } from "@/lib/share/urls";
import { milestoneLine } from "@/lib/milestones";
import {
  trackShareClicked,
  trackSignatureCompleted,
  trackSignFormSubmitted,
  trackSignModalOpened,
} from "@/lib/analytics/track";

interface Props {
  open: boolean;
  onClose: () => void;
  /** "sign" = full sign-the-bill flow (default). "comment-only" = create an account to comment without signing. */
  mode?: "sign" | "comment-only";
  /**
   * Open on the returning-visitor sign-in (phone/email + code only) instead of
   * create-account. For "you're not signed in" prompts, where the visitor may
   * well have signed already.
   */
  startInSignIn?: boolean;
}

type Step = "form" | "otp" | "done";
type Method = "email" | "phone";
type Flow = "signUp" | "signIn";

const VERSION = "0.1.0";

/** Every state in which the person has signed some version of the Bill. */
function isSignedStatus(
  status: SignatureStatus | { state: "loading" },
): status is Extract<
  SignatureStatus,
  { state: "signed" | "signed-earlier" | "signed-other" | "signed-version-unknown" }
> {
  return (
    status.state === "signed" ||
    status.state === "signed-earlier" ||
    status.state === "signed-other" ||
    status.state === "signed-version-unknown"
  );
}

/**
 * The selfie step is out of the post-sign flow for now: sharing is the
 * priority, and a camera prompt between the signer and their share buttons
 * costs shares. The component and its storage are untouched — flip this back
 * to bring it back.
 */
const SHOW_SELFIE_IN_SIGN_FLOW = false;

/** "Sent to 3 people" — the count of invitations that actually went out. */
export function inviteSummary(sent: number): string {
  if (sent === 0) return "No new invitations sent.";
  return `Sent to ${sent} ${sent === 1 ? "person" : "people"}.`;
}

/**
 * The thank-you heading. Uses the signer's REAL first name — the one they
 * typed, or their account's — never the masked public display name: masking
 * is for strangers, and this is said to the signer themselves.
 */
export function signerGreeting(
  firstName: string,
  signerNumber: number | null,
): string {
  const name = firstName.trim().split(/\s+/)[0] ?? "";
  if (signerNumber === null) {
    return name ? `Thank you for signing, ${name}.` : "Thank you for signing.";
  }
  const who = name ? `${name}, you're` : "You're";
  return `${who} signer #${signerNumber.toLocaleString("en-US")}.`;
}

interface Country {
  id: string;
  code: string;
  flag: string;
  name: string;
}

const COUNTRIES: ReadonlyArray<Country> = [
  { id: "US", code: "+1", flag: "🇺🇸", name: "United States" },
  { id: "CA", code: "+1", flag: "🇨🇦", name: "Canada" },
  { id: "MX", code: "+52", flag: "🇲🇽", name: "Mexico" },
  { id: "GB", code: "+44", flag: "🇬🇧", name: "United Kingdom" },
  { id: "IE", code: "+353", flag: "🇮🇪", name: "Ireland" },
  { id: "AU", code: "+61", flag: "🇦🇺", name: "Australia" },
  { id: "NZ", code: "+64", flag: "🇳🇿", name: "New Zealand" },
  { id: "DE", code: "+49", flag: "🇩🇪", name: "Germany" },
  { id: "FR", code: "+33", flag: "🇫🇷", name: "France" },
  { id: "ES", code: "+34", flag: "🇪🇸", name: "Spain" },
  { id: "IT", code: "+39", flag: "🇮🇹", name: "Italy" },
  { id: "PT", code: "+351", flag: "🇵🇹", name: "Portugal" },
  { id: "NL", code: "+31", flag: "🇳🇱", name: "Netherlands" },
  { id: "BE", code: "+32", flag: "🇧🇪", name: "Belgium" },
  { id: "CH", code: "+41", flag: "🇨🇭", name: "Switzerland" },
  { id: "AT", code: "+43", flag: "🇦🇹", name: "Austria" },
  { id: "SE", code: "+46", flag: "🇸🇪", name: "Sweden" },
  { id: "NO", code: "+47", flag: "🇳🇴", name: "Norway" },
  { id: "DK", code: "+45", flag: "🇩🇰", name: "Denmark" },
  { id: "FI", code: "+358", flag: "🇫🇮", name: "Finland" },
  { id: "PL", code: "+48", flag: "🇵🇱", name: "Poland" },
  { id: "GR", code: "+30", flag: "🇬🇷", name: "Greece" },
  { id: "TR", code: "+90", flag: "🇹🇷", name: "Turkey" },
  { id: "IL", code: "+972", flag: "🇮🇱", name: "Israel" },
  { id: "AE", code: "+971", flag: "🇦🇪", name: "United Arab Emirates" },
  { id: "SA", code: "+966", flag: "🇸🇦", name: "Saudi Arabia" },
  { id: "EG", code: "+20", flag: "🇪🇬", name: "Egypt" },
  { id: "ZA", code: "+27", flag: "🇿🇦", name: "South Africa" },
  { id: "NG", code: "+234", flag: "🇳🇬", name: "Nigeria" },
  { id: "KE", code: "+254", flag: "🇰🇪", name: "Kenya" },
  { id: "IN", code: "+91", flag: "🇮🇳", name: "India" },
  { id: "PK", code: "+92", flag: "🇵🇰", name: "Pakistan" },
  { id: "BD", code: "+880", flag: "🇧🇩", name: "Bangladesh" },
  { id: "ID", code: "+62", flag: "🇮🇩", name: "Indonesia" },
  { id: "PH", code: "+63", flag: "🇵🇭", name: "Philippines" },
  { id: "TH", code: "+66", flag: "🇹🇭", name: "Thailand" },
  { id: "VN", code: "+84", flag: "🇻🇳", name: "Vietnam" },
  { id: "MY", code: "+60", flag: "🇲🇾", name: "Malaysia" },
  { id: "SG", code: "+65", flag: "🇸🇬", name: "Singapore" },
  { id: "HK", code: "+852", flag: "🇭🇰", name: "Hong Kong" },
  { id: "TW", code: "+886", flag: "🇹🇼", name: "Taiwan" },
  { id: "JP", code: "+81", flag: "🇯🇵", name: "Japan" },
  { id: "KR", code: "+82", flag: "🇰🇷", name: "South Korea" },
  { id: "CN", code: "+86", flag: "🇨🇳", name: "China" },
  { id: "BR", code: "+55", flag: "🇧🇷", name: "Brazil" },
  { id: "AR", code: "+54", flag: "🇦🇷", name: "Argentina" },
  { id: "CL", code: "+56", flag: "🇨🇱", name: "Chile" },
  { id: "CO", code: "+57", flag: "🇨🇴", name: "Colombia" },
  { id: "PE", code: "+51", flag: "🇵🇪", name: "Peru" },
  { id: "RU", code: "+7", flag: "🇷🇺", name: "Russia" },
  { id: "UA", code: "+380", flag: "🇺🇦", name: "Ukraine" },
];

function formatNamePreview(
  first: string,
  last: string,
  format: "initials" | "first-initial" | "full",
): string {
  const f = first.trim();
  const l = last.trim();
  if (format === "full") return `${f} ${l}`.trim();
  const maskedLast = l
    ? `${l[0].toUpperCase()}${"*".repeat(Math.max(0, l.length - 1))}`
    : "";
  if (format === "first-initial") return `${f} ${maskedLast}`.trim();
  const maskedFirst = f
    ? `${f[0].toUpperCase()}${"*".repeat(Math.max(0, f.length - 1))}`
    : "";
  return `${maskedFirst} ${maskedLast}`.trim();
}

export interface PostSignShareLinks {
  /** The plain link shown in the copy box. */
  shareUrl: string;
  twitterHref: string;
  linkedinHref: string;
  emailHref: string;
  /** LinkedIn's dialog carries no text, so this is what people paste. */
  suggestedMessage: string;
}

/**
 * Every outbound link on the post-signature share step.
 *
 * Pure and exported so it can be pinned by tests: this is the highest-intent
 * share surface on the site, and a `?ref=`/`?via=` that quietly falls off one
 * of these buttons is invisible until the referral numbers are already wrong.
 * Everything goes through `signerShareLink` — nothing here hand-builds a URL.
 * With a slug the links are the short theaibill.org/s/<slug> form (no raw id
 * anywhere in the message); without one — no slug yet, or migration 0014 not
 * applied — they fall back to the long /signatories/<id>?ref=<id> form.
 *
 * Returns inert values (`""` / `"#"`) until both the signer id and the origin
 * exist, so a half-built link is never rendered as a real one. `origin` is
 * empty during SSR, before the client has a `window`.
 */
export function buildPostSignShareLinks(opts: {
  origin: string;
  signerId: string | null;
  whyISigned: string | null;
  shareSlug?: string | null;
}): PostSignShareLinks {
  const ready = Boolean(opts.signerId && opts.origin);
  const urlFor = (channel: ShareChannel) =>
    ready
      ? signerShareLink(opts.origin, opts.signerId!, opts.shareSlug, channel)
      : "";
  const textFor = (channel: ShareChannel) =>
    buildShareText({ whyISigned: opts.whyISigned, channel });

  if (!ready) {
    return {
      shareUrl: "",
      twitterHref: "#",
      linkedinHref: "#",
      emailHref: "#",
      suggestedMessage: textFor("linkedin"),
    };
  }

  return {
    shareUrl: urlFor("copy"),
    // Shared with the confirmation email, which renders the same three
    // buttons — see `shareHrefs`.
    ...shareHrefs({ url: urlFor, text: textFor }),
    suggestedMessage: textFor("linkedin"),
  };
}

/** The machine-readable code on a Clerk API error, if `err` is one. */
export function clerkErrorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: Array<{ code?: string }> }).errors;
    if (Array.isArray(errors)) return errors[0]?.code;
  }
  return undefined;
}

const IDENTIFIER_EXISTS_CODES: ReadonlySet<string> = new Set([
  "form_identifier_exists",
  "form_identifier_exists__phone_number",
  "form_identifier_exists__email_address",
]);

/**
 * Clerk refuses to start or finish a sign-up/sign-in while this browser
 * already holds a session ("Session already exists"). That is not a failure
 * from the person's point of view — they are already in — so every Clerk call
 * in this modal treats it as "adopt the session and carry on".
 */
export function isSessionExistsError(err: unknown): boolean {
  return clerkErrorCode(err) === "session_exists";
}

function clerkErrorMessage(err: unknown): string {
  if (clerkErrorCode(err) === "form_identifier_not_found") {
    return "We couldn't find an account with that. Check it, or create a new account.";
  }
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: Array<{ message?: string }> }).errors;
    if (errors && errors.length > 0 && errors[0].message) {
      return errors[0].message;
    }
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

export default function SignModal({
  open,
  onClose,
  mode: modeProp = "sign",
  startInSignIn = false,
}: Props) {
  const { signUp, isLoaded: signUpLoaded, setActive: setSignUpActive } =
    useSignUp();
  const { signIn, isLoaded: signInLoaded, setActive: setSignInActive } =
    useSignIn();
  const { user, isSignedIn } = useUser();
  const clerk = useClerk();
  const { signOut } = clerk;
  const router = useRouter();

  const [step, setStep] = useState<Step>("form");
  // Active mode — can be overridden by the open-sign-modal event detail.
  const [mode, setMode] = useState<"sign" | "comment-only">(modeProp);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [method, setMethod] = useState<Method>("phone");
  const [email, setEmail] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [countryId, setCountryId] = useState("US");
  const [signatureStatus, setSignatureStatus] = useState<
    SignatureStatus | { state: "loading" } | null
  >(null);
  const [shareLocation, setShareLocation] = useState(true);
  const [nameDisplayFormat, setNameDisplayFormat] = useState<
    "initials" | "first-initial" | "full"
  >("full");
  const [notificationPreference, setNotificationPreference] = useState<
    "major" | "minor" | "none"
  >("major");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [flow, setFlow] = useState<Flow>("signUp");
  // Returning visitor who only needs to sign in: we ask for the phone/email
  // and nothing else. Their name and preferences are already on file.
  const [signInOnly, setSignInOnly] = useState(false);
  const [signerId, setSignerId] = useState<string | null>(null);
  // Their place in line, for the greeting and the homepage. Filled from
  // getMySignatureStatus after the signature lands (or on open, for someone
  // who already signed); null until then, and the greeting copes.
  const [signerNumber, setSignerNumber] = useState<number | null>(null);
  // Their short-link slug; null means the long link (see short-links.ts).
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  // The current version, when they signed only an earlier one: shown as the
  // optional "v0.1.0 is out. See what changed." line on the share view.
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const liveSigners = useOptionalLiveSigners();
  const [signerName, setSignerName] = useState<string>("");
  const [copied, setCopied] = useState(false);
  // "Why I signed" lives on the post-signature step only — the pre-signature
  // form is already long, and anything added ahead of the conversion event is
  // friction. Here the user has already signed and is in a moment of
  // commitment, so the ask is free.
  const [whyInput, setWhyInput] = useState("");
  /** What's actually saved on the server — drives the share copy. */
  const [whySaved, setWhySaved] = useState<string | null>(null);
  const [whyPending, setWhyPending] = useState(false);
  const [whyError, setWhyError] = useState<string | null>(null);
  const [inviteEmails, setInviteEmails] = useState<string[]>([]);
  const [inviteInput, setInviteInput] = useState("");
  const [invitePending, setInvitePending] = useState(false);
  const [inviteResult, setInviteResult] = useState<
    | {
        kind: "success";
        sent: string[];
        skipped: InvitationResult["skipped"];
        failed: string[];
      }
    | { kind: "error"; message: string }
    | null
  >(null);

  const dialogRef = useRef<HTMLDivElement>(null);

  // Top of the funnel. `mode` is the honest answer to "which button did they
  // come from" — the two modes are genuinely different intents, and the drop
  // -off from here to `signature_completed` is the number worth arguing about.
  useEffect(() => {
    if (!open) return;
    trackSignModalOpened({ source: mode });
  }, [open, mode]);

  // Close on Escape. Use the DOM KeyboardEvent (not React's synthetic
  // event imported above) — addEventListener expects globalThis.KeyboardEvent.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setStep("form");
      setMode(modeProp);
      setCode("");
      setError(null);
      setLoading(false);
      setSignerId(null);
      setSignerNumber(null);
      setShareSlug(null);
      setSignerName("");
      setCopied(false);
      setWhyInput("");
      setWhySaved(null);
      setWhyPending(false);
      setWhyError(null);
      setInviteEmails([]);
      setInviteInput("");
      setInvitePending(false);
      setInviteResult(null);
      setSignatureStatus(null);
      setNewVersion(null);
      setSignInOnly(false);
      setFlow("signUp");
    }
  }, [open, modeProp]);

  // Start on sign-in when the opener asked for it. The reset above clears it
  // on close, so each open starts where its caller wanted.
  useEffect(() => {
    if (open && startInSignIn) setSignInOnly(true);
  }, [open, startInSignIn]);

  // When the modal opens with a signed-in user, fetch whether they've
  // signed any version, so a signer lands on their share view instead of
  // being asked to sign again.
  useEffect(() => {
    if (!open) return;
    if (!isSignedIn) {
      setSignatureStatus(null);
      return;
    }
    setSignatureStatus({ state: "loading" });
    let cancelled = false;
    getMySignatureStatus(VERSION)
      .then((status) => {
        if (cancelled) return;
        setSignatureStatus(status);
        landOnShareIfSigned(status);
      })
      // Unknown, not "loading" forever: an unanswered status must not hide
      // the sign link from someone who has not signed.
      .catch(() => {
        if (!cancelled) setSignatureStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isSignedIn]);

  /**
   * Anyone who has signed ANY version lands on their share view — their card,
   * their why and the share buttons — never on a blocking "you've already
   * signed" screen or a screen of account controls. (Removing a signature or
   * deleting the account lives on /account; adding their name to a newer
   * version lives at the bottom of /v/<version>.) Called wherever a status
   * arrives: on open, and after a sign-in by a returning signer.
   */
  function landOnShareIfSigned(status: SignatureStatus) {
    if (!isSignedStatus(status) || !status.signerId) return;
    setMode("sign");
    setSignerId(status.signerId);
    setSignerNumber(status.signerNumber ?? null);
    setShareSlug(status.shareSlug ?? null);
    // Only "signed-earlier" has a newer version open for signing; the other
    // states have nothing to point at.
    setNewVersion(
      status.state === "signed-earlier" ? status.requestedVersion : null,
    );
    const why = status.whyISigned ?? null;
    setWhySaved(why);
    setWhyInput(why ?? "");
    setStep("done");
  }

  // Tell the page who they are as soon as we know, so the homepage has
  // already switched to "You're signer #N" by the time they close this.
  const setViewer = liveSigners?.setViewer;
  useEffect(() => {
    if (step !== "done" || mode !== "sign") return;
    if (!signerId || signerNumber === null) return;
    setViewer?.({ signerId, signerNumber, newVersion });
  }, [step, mode, signerId, signerNumber, newVersion, setViewer]);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open) return null;

  /**
   * The conversion event, reported from the one place that knows all three
   * facts: how they verified, whether they came in on somebody's share link,
   * and which surface that link was on. The last two are read server-side from
   * httpOnly cookies and handed back on the result — the browser cannot work
   * them out for itself.
   *
   * Fire-and-forget by construction: `track()` swallows its own errors, so
   * this can never turn a completed signature into a failed one.
   */
  function reportSignatureCompleted(res: {
    referred?: boolean;
    channel?: string | null;
  }) {
    trackSignatureCompleted({
      method,
      referred: res.referred ?? false,
      channel: res.channel ?? null,
    });
  }

  /**
   * True when this browser already holds a Clerk session. `isSignedIn` from
   * useUser is `undefined` until Clerk loads and lags a `setActive` by a
   * render, so it is not enough on its own to decide whether to start a
   * sign-up: starting one against a live session is exactly what produces
   * Clerk's "Session already exists".
   */
  function hasSession(): boolean {
    return Boolean(isSignedIn || clerk.session);
  }

  /**
   * Called when Clerk reports `session_exists`. Makes the session this browser
   * already holds the active one, so the server actions below can see it.
   * Returns false only when Clerk says a session exists but none is visible to
   * us — which a page refresh resolves.
   */
  async function adoptExistingSession(): Promise<boolean> {
    if (clerk.session) return true;
    const client = clerk.client as
      | { activeSessions?: Array<{ id: string }>; sessions?: Array<{ id: string }> }
      | undefined;
    const existing = client?.activeSessions?.[0] ?? client?.sessions?.[0];
    if (!existing) return false;
    await clerk.setActive({ session: existing.id });
    return true;
  }

  /**
   * Everything after authentication: create the signer (comment-only) or
   * record the signature (sign). Shared by the already-signed-in shortcut, the
   * post-OTP path, and the session_exists recovery, so the three cannot drift.
   */
  async function finishAsSignedIn() {
    // Sign-in-only came in without a name. Comment-only can still finish —
    // the server returns the existing signer without needing one — but a
    // signature needs the name fields, so hand them back the (now signed-in)
    // form, prefilled from their account.
    if (signInOnly && mode === "sign") {
      // Prefill from the account so finishing isn't a retyping exercise.
      setFirstName((v) => v || clerk.user?.firstName || "");
      setLastName((v) => v || clerk.user?.lastName || "");
      setSignInOnly(false);
      setStep("form");
      router.refresh();
      return;
    }

    let res: {
      success: boolean;
      error?: string;
      alreadySigned?: boolean;
      signerId?: string;
      displayName?: string;
      referred?: boolean;
      channel?: string | null;
    };
    if (mode === "comment-only") {
      res = await createSignerFromModal({
        firstName,
        lastName,
        method,
        shareLocation,
        nameDisplayFormat,
        notificationPreference,
      });
    } else {
      res = await recordSignatureFromModal({
        firstName,
        lastName,
        method,
        shareLocation,
        versionString: VERSION,
        nameDisplayFormat,
        notificationPreference,
      });
    }

    // They filled in the sign form but had already signed some version:
    // show their share view, not an error. Signing a newer version is a
    // choice made on /v/<version>, so the server records nothing here.
    if (res.alreadySigned) {
      try {
        landOnShareIfSigned(await getMySignatureStatus(VERSION));
        router.refresh();
        return;
      } catch {
        // Fall through to the error below.
      }
    }

    if (!res.success) {
      if (signInOnly) {
        // Signed in, but this account never finished setting up (no signer
        // row). Show the name fields rather than a dead end.
        setFirstName((v) => v || clerk.user?.firstName || "");
        setLastName((v) => v || clerk.user?.lastName || "");
        setSignInOnly(false);
        setStep("form");
        setError("You're signed in. Add your name to finish setting up your account.");
        return;
      }
      setError(
        res.error ??
          (mode === "comment-only"
            ? "We couldn't create your account."
            : "We couldn't record your signature."),
      );
      return;
    }
    if (mode === "sign") reportSignatureCompleted(res);
    if (res.signerId) setSignerId(res.signerId);
    if (res.displayName) setSignerName(res.displayName);
    setStep("done");
    router.refresh();
    if (mode === "sign") void loadSignerNumber();
  }

  /**
   * Their signer number, for the greeting. Read back from the server rather
   * than guessed from the live count, which can be a poll behind. Best effort:
   * without it the greeting falls back to plain thanks.
   */
  async function loadSignerNumber() {
    try {
      const status = await getMySignatureStatus(VERSION);
      if (status.state === "signed") {
        if (status.signerNumber !== undefined) setSignerNumber(status.signerNumber);
        setShareSlug(status.shareSlug ?? null);
      }
    } catch {
      // Keep the plain greeting.
    }
  }

  /** Recover from `session_exists` by carrying on as the signed-in user. */
  async function recoverFromSessionExists() {
    if (await adoptExistingSession()) {
      await finishAsSignedIn();
    } else {
      setError("You're already signed in on this browser. Refresh the page to continue.");
    }
  }

  async function startSignIn() {
    if (!signInLoaded || !signIn) {
      setError("Authentication is still loading. Please wait.");
      return;
    }
    await signIn.create({
      identifier,
      strategy: method === "email" ? "email_code" : "phone_code",
    });
    setFlow("signIn");
    setStep("otp");
  }

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    if (mode === "sign" && !signInOnly) trackSignFormSubmitted({ method });

    try {
      // Already authenticated (returning visitor, or a session left over from
      // a prior attempt): skip OTP entirely and act as that identity.
      if (hasSession()) {
        await finishAsSignedIn();
        return;
      }

      if (signInOnly) {
        try {
          await startSignIn();
        } catch (err) {
          if (isSessionExistsError(err)) return await recoverFromSessionExists();
          if (clerkErrorCode(err) === "form_identifier_not_found") {
            // No account yet — show them the create-account fields instead of
            // making them find the toggle.
            setSignInOnly(false);
            setError(
              `No account uses that ${method === "email" ? "email" : "number"} yet. Add your name to create one.`,
            );
            return;
          }
          throw err;
        }
        return;
      }

      if (!signUpLoaded || !signUp) {
        setError("Authentication is still loading. Please wait.");
        return;
      }

      // Try sign-up first.
      try {
        await signUp.create({
          firstName,
          lastName,
          ...(method === "email"
            ? { emailAddress: identifier }
            : { phoneNumber: identifier }),
        });

        if (method === "email") {
          await signUp.prepareEmailAddressVerification({
            strategy: "email_code",
          });
        } else {
          await signUp.preparePhoneNumberVerification({
            strategy: "phone_code",
          });
        }
        setFlow("signUp");
        setStep("otp");
      } catch (signUpErr: unknown) {
        if (isSessionExistsError(signUpErr)) {
          return await recoverFromSessionExists();
        }
        const code = clerkErrorCode(signUpErr);
        if (code && IDENTIFIER_EXISTS_CODES.has(code)) {
          // Returning signer — switch to sign-in OTP.
          try {
            await startSignIn();
          } catch (err) {
            if (isSessionExistsError(err)) return await recoverFromSessionExists();
            throw err;
          }
        } else {
          throw signUpErr;
        }
      }
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleCodeSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // A previous press of this button may already have verified the code and
      // activated the session, then failed in the server action. Verifying the
      // same code again is what Clerk answers with "Session already exists";
      // there is nothing left to verify, so just finish.
      if (hasSession()) {
        await finishAsSignedIn();
        return;
      }

      let sessionId: string | undefined | null = null;

      try {
        if (flow === "signUp") {
          if (!signUpLoaded || !signUp) {
            setError("Authentication is still loading. Please wait.");
            return;
          }
          const result =
            method === "email"
              ? await signUp.attemptEmailAddressVerification({ code })
              : await signUp.attemptPhoneNumberVerification({ code });
          // Surface Clerk's actual state so blockers are debuggable.
          console.log("[SignModal] sign-up after verify:", {
            status: result.status,
            missingFields: (result as { missingFields?: string[] }).missingFields,
            unverifiedFields: (result as { unverifiedFields?: string[] })
              .unverifiedFields,
          });
          if (result.status !== "complete") {
            const missingFields = (result as { missingFields?: string[] })
              .missingFields;
            const unverifiedFields = (result as { unverifiedFields?: string[] })
              .unverifiedFields;
            const parts: string[] = [`status: ${result.status}`];
            if (missingFields && missingFields.length > 0) {
              parts.push(`missing: ${missingFields.join(", ")}`);
            }
            if (unverifiedFields && unverifiedFields.length > 0) {
              parts.push(`unverified: ${unverifiedFields.join(", ")}`);
            }
            setError(`Sign-up incomplete (${parts.join("; ")}).`);
            return;
          }
          sessionId = result.createdSessionId;
          if (sessionId) {
            await setSignUpActive({ session: sessionId });
          }
        } else {
          if (!signInLoaded || !signIn) {
            setError("Authentication is still loading. Please wait.");
            return;
          }
          const result = await signIn.attemptFirstFactor({
            strategy: method === "email" ? "email_code" : "phone_code",
            code,
          });
          console.log("[SignModal] sign-in after verify:", {
            status: result.status,
          });
          if (result.status !== "complete") {
            setError(`Sign-in incomplete (status: ${result.status}).`);
            return;
          }
          sessionId = result.createdSessionId;
          if (sessionId) {
            await setSignInActive({ session: sessionId });
          }
        }
      } catch (err) {
        if (isSessionExistsError(err)) return await recoverFromSessionExists();
        throw err;
      }

      // Hand off to the server action to record the signature / create the account.
      await finishAsSignedIn();
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const selectedCountry =
    COUNTRIES.find((c) => c.id === countryId) ?? COUNTRIES[0];
  const identifier =
    method === "email"
      ? email.trim()
      : `${selectedCountry.code}${phoneDigits.replace(/\D/g, "")}`;
  const friendlyIdentifier =
    method === "email"
      ? email.trim()
      : `${selectedCountry.flag} ${selectedCountry.code} ${phoneDigits}`;

  const identifierValid =
    method === "email"
      ? email.trim().length > 0
      : phoneDigits.replace(/\D/g, "").length >= 7;
  const isFormValid = signInOnly
    ? identifierValid
    : firstName.trim().length > 0 &&
      lastName.trim().length > 0 &&
      identifierValid;

  // Every outbound link goes through the canonical builder so the ?ref=/?via=
  // attribution can never silently fall off one of these buttons. Leads with
  // the signer's own sentence once they've written one.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  // The site's one goal story (@/lib/milestones). The live count can trail
  // their own signature by a poll, so never count below their own number.
  const milestone =
    signerNumber !== null
      ? milestoneLine(Math.max(liveSigners?.count ?? 0, signerNumber))
      : null;
  const { shareUrl, twitterHref, linkedinHref, emailHref, suggestedMessage } =
    buildPostSignShareLinks({
      origin,
      signerId,
      whyISigned: whySaved,
      shareSlug,
    });

  async function handleSaveWhy() {
    setWhyPending(true);
    setWhyError(null);
    try {
      const res = await saveWhyISigned(whyInput);
      if (!res.success) {
        setWhyError(res.error ?? "Couldn't save that.");
        return;
      }
      setWhySaved(res.whyISigned ?? null);
      // Reflect the sanitised/truncated text back so what they see is what
      // the world will see.
      setWhyInput(res.whyISigned ?? "");
    } catch (err) {
      setWhyError(err instanceof Error ? err.message : "Couldn't save that.");
    } finally {
      setWhyPending(false);
    }
  }

  /** Every share surface on the post-signature step reports through here. */
  function reportShareClicked(channel: ShareChannel) {
    trackShareClicked({ channel, surface: "post-sign" });
  }

  async function copyShareUrl() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      // Reported only after the write resolved. Same rule the invite path
      // below applies with `res.sent > 0`: a clipboard write rejected by an
      // insecure context or a denied permission is not a share.
      reportShareClicked("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can fail under non-secure contexts; fall back to select.
      const input = document.getElementById(
        "share-url-input",
      ) as HTMLInputElement | null;
      input?.select();
    }
  }

  function tryAddInviteEmail(raw: string): boolean {
    const trimmed = raw.trim().toLowerCase().replace(/[,;]+$/, "");
    if (!trimmed) return false;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return false;
    if (inviteEmails.includes(trimmed)) return false;
    setInviteEmails([...inviteEmails, trimmed]);
    return true;
  }

  function handleInviteKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === "," || e.key === ";" || e.key === " ") {
      e.preventDefault();
      if (tryAddInviteEmail(inviteInput)) {
        setInviteInput("");
      }
    } else if (
      e.key === "Backspace" &&
      inviteInput.length === 0 &&
      inviteEmails.length > 0
    ) {
      setInviteEmails(inviteEmails.slice(0, -1));
    }
  }

  function removeInviteEmail(email: string) {
    setInviteEmails(inviteEmails.filter((x) => x !== email));
  }

  async function handleSendInvites() {
    // Flush whatever is in the input box first.
    const finalList = [...inviteEmails];
    const pendingTrimmed = inviteInput.trim().toLowerCase().replace(/[,;]+$/, "");
    if (
      pendingTrimmed &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pendingTrimmed) &&
      !finalList.includes(pendingTrimmed)
    ) {
      finalList.push(pendingTrimmed);
    }
    if (finalList.length === 0) {
      setInviteResult({
        kind: "error",
        message: "Add at least one email address first.",
      });
      return;
    }
    setInvitePending(true);
    setInviteResult(null);
    try {
      const res = await sendInvitationsAction(finalList);
      if (res.error) {
        setInviteResult({ kind: "error", message: res.error });
      } else {
        // Only a send that actually left the building counts as a share.
        if (res.sent.length > 0) reportShareClicked("invite");
        setInviteResult({
          kind: "success",
          sent: res.sent,
          skipped: res.skipped,
          failed: res.failed,
        });
        setInviteEmails([]);
        setInviteInput("");
      }
    } catch (err) {
      setInviteResult({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to send.",
      });
    } finally {
      setInvitePending(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/60 px-3 py-4 backdrop-blur-sm sm:px-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-modal-title"
    >
      <div
        ref={dialogRef}
        className="relative my-auto w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 rounded-full p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
        >
          <svg
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          >
            <path
              strokeLinecap="round"
              d="M5 5l10 10M15 5L5 15"
            />
          </svg>
        </button>

        {step === "form" &&
          (signatureStatus?.state === "loading" ||
            (signatureStatus !== null && isSignedStatus(signatureStatus))) && (
          <div className="py-16 text-center text-sm text-zinc-500">
            Checking your signature…
          </div>
        )}

        {step === "form" &&
          (signatureStatus === null ||
            signatureStatus.state === "anonymous" ||
            signatureStatus.state === "no-signer" ||
            signatureStatus.state === "not-signed") && (
          <form onSubmit={handleFormSubmit} noValidate>
            <h2
              id="sign-modal-title"
              className="text-2xl font-semibold tracking-tight text-zinc-950"
            >
              {signInOnly
                ? "Sign in"
                : mode === "comment-only"
                  ? "Create an account to comment"
                  : "Sign the AI Bill of Rights"}
            </h2>
            <p className="mt-1.5 text-sm text-zinc-600">
              {signInOnly
                ? "Enter the phone number or email you used before. We'll send you a code."
                : mode === "comment-only"
                  ? "Create a free account so your comments on the working draft are attributed to you. You can sign the bill itself any time from your account page."
                  : `Add your name to v${VERSION} of the document.`}
            </p>

            {!isSignedIn ? (
              <p className="mt-2 text-sm text-zinc-600">
                {signInOnly ? "New here? " : "Already have an account? "}
                <button
                  type="button"
                  onClick={() => {
                    setSignInOnly((v) => !v);
                    setError(null);
                  }}
                  className="font-semibold text-blue-600 underline underline-offset-2 hover:no-underline"
                >
                  {signInOnly ? "Create an account" : "Sign in"}
                </button>
              </p>
            ) : null}

            {isSignedIn ? (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-900">
                Signed in as{" "}
                <span className="font-semibold">
                  {user?.primaryEmailAddress?.emailAddress ||
                    user?.primaryPhoneNumber?.phoneNumber ||
                    "current account"}
                </span>
                . Your signature will be attached to this account.{" "}
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="font-semibold underline hover:no-underline"
                >
                  Use a different account
                </button>
              </div>
            ) : null}

            {!signInOnly ? (
            <div className="mt-6 grid grid-cols-2 gap-3">
              <label className="block">
                <span className="sr-only">First name</span>
                <input
                  type="text"
                  autoComplete="given-name"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <label className="block">
                <span className="sr-only">Last name</span>
                <input
                  type="text"
                  autoComplete="family-name"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
            </div>
            ) : null}

            <div
              className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
              role="radiogroup"
              aria-label="Verification method"
            >
              <span className="text-sm font-bold text-zinc-900">
                Verify me via
              </span>
              <div className="relative inline-flex w-full rounded-lg bg-zinc-100 p-1 text-sm sm:w-auto">
                <span
                  aria-hidden
                  className="pointer-events-none absolute left-1 top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-md bg-white shadow-sm ring-1 ring-zinc-200 transition-transform duration-200"
                  style={{
                    transform:
                      method === "email" ? "translateX(100%)" : "translateX(0)",
                  }}
                />
                <button
                  type="button"
                  role="radio"
                  aria-checked={method === "phone"}
                  onClick={() => setMethod("phone")}
                  className={`relative z-10 flex-1 rounded-md px-4 py-1.5 text-center font-medium transition-colors sm:min-w-[6rem] sm:flex-none ${
                    method === "phone" ? "text-zinc-950" : "text-zinc-500"
                  }`}
                >
                  Phone SMS
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={method === "email"}
                  onClick={() => setMethod("email")}
                  className={`relative z-10 flex-1 rounded-md px-4 py-1.5 text-center font-medium transition-colors sm:min-w-[6rem] sm:flex-none ${
                    method === "email" ? "text-zinc-950" : "text-zinc-500"
                  }`}
                >
                  Email
                </button>
              </div>
            </div>

            <div className="mt-4">
              {method === "email" ? (
                <label className="block">
                  <span className="sr-only">Email address</span>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="me@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </label>
              ) : (
                <div className="flex gap-2">
                  <label className="relative block">
                    <span className="sr-only">Country</span>
                    <select
                      value={countryId}
                      onChange={(e) => setCountryId(e.target.value)}
                      aria-label="Country"
                      title={selectedCountry.name}
                      className="w-[5.75rem] appearance-none rounded-lg border border-zinc-300 bg-white py-2.5 pl-2.5 pr-7 text-sm text-zinc-950 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      {COUNTRIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.flag} {c.code}
                        </option>
                      ))}
                    </select>
                    <svg
                      aria-hidden
                      viewBox="0 0 12 12"
                      fill="none"
                      className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-500"
                    >
                      <path
                        d="M3 4.5L6 7.5L9 4.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </label>
                  <label className="block flex-1">
                    <span className="sr-only">Phone number</span>
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      placeholder="555 123 4567"
                      value={phoneDigits}
                      onChange={(e) => setPhoneDigits(e.target.value)}
                      required
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </label>
                </div>
              )}
            </div>

            {!signInOnly ? (
            <>
            <label className="mt-5 flex items-start gap-2.5 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={shareLocation}
                onChange={(e) => setShareLocation(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500/30"
              />
              <span>Share my approximate city &amp; state</span>
            </label>

            {/* Show my name as — only renders once both names are filled in */}
            {firstName.trim() && lastName.trim() ? (
              <fieldset className="mt-5">
                <legend className="text-sm font-bold text-zinc-900">
                  Show my name as
                </legend>
                <div
                  className="mt-2 flex flex-col gap-1.5"
                  role="radiogroup"
                  aria-label="Name display format"
                >
                  {(["initials", "first-initial", "full"] as const).map(
                    (value) => (
                      <label
                        key={value}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-sm text-zinc-800 transition-colors hover:bg-zinc-50"
                      >
                        <input
                          type="radio"
                          name="name-display-format"
                          value={value}
                          checked={nameDisplayFormat === value}
                          onChange={() => setNameDisplayFormat(value)}
                          className="h-4 w-4 border-zinc-300 text-blue-600 focus:ring-blue-500/30"
                        />
                        <span className="font-mono text-sm text-zinc-900">
                          {formatNamePreview(firstName, lastName, value)}
                        </span>
                      </label>
                    ),
                  )}
                </div>
              </fieldset>
            ) : null}

            {/* Alert me when updated */}
            <fieldset className="mt-5">
              <legend className="text-sm font-bold text-zinc-900">
                Alert me when the AI Bill of Rights is updated
              </legend>
              <div
                className="mt-2 flex flex-col gap-1.5"
                role="radiogroup"
                aria-label="Notification preference"
              >
                {(
                  [
                    {
                      value: "major",
                      label: "Major revisions",
                      hint: "v2.0.0 → v3.0.0",
                    },
                    {
                      value: "minor",
                      label: "Minor revisions",
                      hint: "v0.1.0 → v0.2.0",
                    },
                    { value: "none", label: "None", hint: "" },
                  ] as const
                ).map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-transparent px-2 py-1.5 text-sm text-zinc-800 transition-colors hover:bg-zinc-50"
                  >
                    <input
                      type="radio"
                      name="notification-preference"
                      value={opt.value}
                      checked={notificationPreference === opt.value}
                      onChange={() =>
                        setNotificationPreference(opt.value)
                      }
                      className="h-4 w-4 border-zinc-300 text-blue-600 focus:ring-blue-500/30"
                    />
                    <span>{opt.label}</span>
                    {opt.hint ? (
                      <span className="ml-1 text-xs text-zinc-500">
                        {opt.hint}
                      </span>
                    ) : null}
                  </label>
                ))}
              </div>
            </fieldset>
            </>
            ) : null}

            {/* Clerk CAPTCHA (required for sign-up in v6) */}
            <div id="clerk-captcha" className="mt-4" />

            {error ? (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={!isFormValid || loading}
              className="mt-6 w-full rounded-full bg-emerald-600 px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? isSignedIn
                  ? "Saving…"
                  : "Sending code…"
                : signInOnly
                  ? "Send me a code"
                  : mode === "comment-only"
                    ? isSignedIn
                      ? "Continue"
                      : "Create account"
                    : "Sign"}
            </button>

            {!isSignedIn ? (
              <p className="mt-3 text-center text-xs text-zinc-500">
                We&apos;ll {method === "email" ? "email" : "text"} you a 6-digit
                code to{" "}
                {signInOnly
                  ? "sign you in."
                  : mode === "comment-only"
                    ? "verify your account."
                    : "confirm your signature."}
              </p>
            ) : null}
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleCodeSubmit}>
            <h2
              id="sign-modal-title"
              className="text-2xl font-semibold tracking-tight text-zinc-950"
            >
              {flow === "signIn"
                ? "Enter the code to sign in"
                : mode === "comment-only"
                  ? "Enter the code to verify your account"
                  : "Enter the code you received to confirm your signature"}
            </h2>
            <p className="mt-1.5 text-sm text-zinc-600">
              We sent a 6-digit code to{" "}
              <span className="font-medium text-zinc-900">
                {friendlyIdentifier}
              </span>
              .
            </p>

            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
              }
              required
              autoFocus
              className="mt-6 w-full rounded-lg border border-zinc-300 px-3 py-3 text-center font-mono text-2xl tracking-[0.5em] text-zinc-950 placeholder:text-zinc-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />

            {error ? (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={code.length !== 6 || loading}
              className="mt-6 w-full rounded-full bg-emerald-600 px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? "Confirming…"
                : flow === "signIn"
                  ? mode === "sign" && !signInOnly
                    ? "Sign in & confirm signature"
                    : "Sign in"
                  : mode === "comment-only"
                    ? "Confirm & create account"
                    : "Confirm signature"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("form");
                setCode("");
                setError(null);
              }}
              className="mt-3 w-full text-center text-sm text-zinc-500 hover:text-zinc-800"
            >
              ← Back
            </button>
          </form>
        )}

        {step === "done" && (
          <div>
            <div className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
                <svg
                  className="h-6 w-6 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2.6"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2
                id="sign-modal-title"
                className="mt-4 text-2xl font-semibold tracking-tight text-zinc-950"
              >
                {mode === "comment-only"
                  ? signInOnly || flow === "signIn"
                    ? `You're signed in${signerName ? `, ${signerName.split(/\s+/)[0]}` : ""}.`
                    : `Account created${signerName ? `, ${signerName.split(/\s+/)[0]}` : ""}. You can now comment.`
                  : signerGreeting(
                      firstName || user?.firstName || "",
                      signerNumber,
                    )}
              </h2>
              {mode === "sign" && milestone ? (
                <p className="mt-1 text-sm font-medium text-zinc-500">
                  {milestone}
                </p>
              ) : null}
              {mode === "sign" && newVersion ? (
                <p className="mt-1 text-sm text-zinc-500">
                  <NewVersionLink version={newVersion} />
                </p>
              ) : null}
              {mode === "sign" ? (
                <div className="mt-5">
                  <p className="text-xl font-semibold tracking-tight text-blue-700">
                    Bring Two Friends.
                  </p>
                  <p className="mt-1 text-base text-zinc-600">
                    Who else should be on this list?
                  </p>
                </div>
              ) : null}
            </div>

            {signerId && mode === "comment-only" ? (
              <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
                <p>
                  You&apos;re all set. Close this window and pick up where you
                  left off — anything you wrote is still on the page.
                </p>
                {/* Only for someone we know has NOT signed. A returning
                    signer lands here too, and offering them a signature they
                    already gave reads as though it didn't exist. While the
                    status is still loading, say nothing rather than guess. */}
                {signatureStatus?.state !== "loading" &&
                !(signatureStatus && isSignedStatus(signatureStatus)) ? (
                  <p className="mt-2 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        // The signing form is this modal: switch it over
                        // rather than sending them to another page.
                        setMode("sign");
                        // Left on from the sign-in they just did; it hides
                        // the name fields a signature needs.
                        setSignInOnly(false);
                        setStep("form");
                        setError(null);
                      }}
                      className="font-semibold text-blue-700 underline underline-offset-4 hover:no-underline"
                    >
                      Sign the AI Bill of Rights
                    </button>
                  </p>
                ) : null}
              </div>
            ) : null}

            {signerId && mode === "sign" ? (
              <>
                {/* Why did you sign? — optional, never blocking. Placed after
                    the signature (not before) so it adds zero friction ahead
                    of the conversion event. Their sentence becomes the default
                    share copy and the pull-quote on their share card. */}
                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                  <label
                    htmlFor="why-i-signed-input"
                    className="block text-xs font-medium uppercase tracking-[0.18em] text-emerald-700"
                  >
                    Why did you sign?{" "}
                    <span className="normal-case tracking-normal text-emerald-700/70">
                      (optional)
                    </span>
                  </label>
                  <p className="mt-1 text-xs text-emerald-800">
                    One sentence, in your own words. We&apos;ll put it on your
                    signature card so people see a person, not a petition.
                  </p>
                  <textarea
                    id="why-i-signed-input"
                    rows={3}
                    maxLength={MAX_WHY_I_SIGNED_LENGTH}
                    value={whyInput}
                    onChange={(e) => setWhyInput(e.target.value)}
                    placeholder="Because my kids will grow up with this technology and I want it on their side."
                    className="mt-3 w-full resize-none rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <span
                      className={`text-xs ${
                        whyInput.length >= MAX_WHY_I_SIGNED_LENGTH
                          ? "font-medium text-amber-700"
                          : "text-zinc-500"
                      }`}
                    >
                      {whyInput.length}/{MAX_WHY_I_SIGNED_LENGTH}
                    </span>
                    <button
                      type="button"
                      onClick={handleSaveWhy}
                      disabled={whyPending || whyInput.trim().length === 0}
                      className="rounded-full bg-emerald-600 px-5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {whyPending
                        ? "Saving…"
                        : whySaved
                          ? "Update"
                          : "Add to my card"}
                    </button>
                  </div>
                  {whyError ? (
                    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                      {whyError}
                    </p>
                  ) : null}
                  {whySaved && !whyError ? (
                    <p className="mt-2 text-xs font-medium text-emerald-800">
                      Saved — your words now lead every share below.
                    </p>
                  ) : null}
                </div>

                {/* Add a selfie photo to your signature — hidden for now,
                    see SHOW_SELFIE_IN_SIGN_FLOW. */}
                {SHOW_SELFIE_IN_SIGN_FLOW ? (
                  <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-500">
                      Add a Selfie Photo to your Signature
                    </p>
                    <div className="mt-3">
                      <SelfieCapture context="modal" />
                    </div>
                  </div>
                ) : null}

                {/* Share link section */}
                <div className="mt-7 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                  <label
                    htmlFor="share-url-input"
                    className="block text-xs font-medium uppercase tracking-[0.18em] text-zinc-500"
                  >
                    Share your signature
                  </label>
                  {/* The real card — the same image X and LinkedIn unfurl —
                      not a mock-up of it. Number, name as they chose to show
                      it, and their why. `v` re-fetches it after they save a
                      why, which the route reads fresh from the database. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/og/signer/${signerId}?v=${encodeURIComponent(whySaved ?? "")}`}
                    alt="Your signature card, as it appears when you share it"
                    width={1200}
                    height={630}
                    className="mt-3 aspect-[1200/630] w-full rounded-lg border border-zinc-200 bg-white object-cover"
                  />
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      id="share-url-input"
                      type="text"
                      readOnly
                      value={shareUrl}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 truncate rounded-lg border border-zinc-300 bg-white px-3 py-2 font-mono text-xs text-zinc-800"
                    />
                    <button
                      type="button"
                      onClick={copyShareUrl}
                      className="shrink-0 rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-700"
                    >
                      {copied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  {/* LinkedIn's share dialog carries no text of its own, so
                      give the signer their own line to paste. */}
                  <p className="mt-3 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-700">
                    <span className="mb-1 block font-semibold uppercase tracking-[0.14em] text-[#0a66c2]">
                      Suggested message
                    </span>
                    {suggestedMessage}
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <a
                      href={twitterHref}
                      onClick={() => reportShareClicked("x")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-center text-xs font-medium text-white hover:bg-zinc-700"
                    >
                      Share on X
                    </a>
                    <a
                      href={linkedinHref}
                      onClick={() => reportShareClicked("linkedin")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-lg bg-[#0a66c2] px-3 py-2 text-center text-xs font-medium text-white hover:bg-[#0a55a3]"
                    >
                      LinkedIn
                    </a>
                    <a
                      href={emailHref}
                      onClick={() => reportShareClicked("email")}
                      className="flex-1 rounded-lg bg-zinc-200 px-3 py-2 text-center text-xs font-medium text-zinc-900 hover:bg-zinc-300"
                    >
                      Email
                    </a>
                  </div>
                </div>

                {/* Invite by email — collapsed under share. Each address
                    gets at most one invitation, ever: the server skips anyone
                    already invited or already signed, and sends no reminders. */}
                <details className="group mt-4 rounded-xl border border-zinc-200 bg-white p-4">
                  <summary className="cursor-pointer list-none text-xs font-medium uppercase tracking-[0.18em] text-zinc-500 marker:hidden">
                    <span className="mr-1 inline-block transition-transform group-open:rotate-90">
                      ▸
                    </span>
                    Invite people by email
                  </summary>
                  <p className="mt-2 text-xs text-zinc-500">
                    Add emails (Enter or comma to separate). Each person gets
                    one short note inviting them to sign — never a reminder.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5 rounded-lg border border-zinc-300 bg-white p-2 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20">
                    {inviteEmails.map((email) => (
                      <span
                        key={email}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20"
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => removeInviteEmail(email)}
                          className="ml-0.5 text-blue-500 hover:text-blue-800"
                          aria-label={`Remove ${email}`}
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    <input
                      type="email"
                      inputMode="email"
                      placeholder={
                        inviteEmails.length === 0
                          ? "someone@example.com"
                          : ""
                      }
                      value={inviteInput}
                      onChange={(e) => setInviteInput(e.target.value)}
                      onKeyDown={handleInviteKeyDown}
                      onBlur={() => {
                        if (tryAddInviteEmail(inviteInput)) {
                          setInviteInput("");
                        }
                      }}
                      className="flex-1 min-w-[8rem] border-0 bg-transparent px-1 py-0.5 text-sm text-zinc-950 outline-none placeholder:text-zinc-400"
                    />
                  </div>
                  {inviteResult?.kind === "success" ? (
                    <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      <p className="font-medium">
                        {inviteSummary(inviteResult.sent.length)}
                      </p>
                      {inviteResult.skipped.length > 0 ? (
                        <ul className="mt-1 space-y-0.5 text-emerald-900/80">
                          {inviteResult.skipped.map((s) => (
                            <li key={s.email}>
                              Skipped {s.email} —{" "}
                              {s.reason === "already-signed"
                                ? "already signed"
                                : "already invited"}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      {inviteResult.failed.length > 0 ? (
                        <p className="mt-1 text-red-700">
                          Couldn&apos;t send to {inviteResult.failed.join(", ")}.
                          Try again later.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                  {inviteResult?.kind === "error" ? (
                    <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                      {inviteResult.message}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={handleSendInvites}
                    disabled={
                      invitePending ||
                      (inviteEmails.length === 0 &&
                        inviteInput.trim().length === 0)
                    }
                    className="mt-3 w-full rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {invitePending ? "Sending…" : "Send invitations"}
                  </button>
                </details>
              </>
            ) : null}

            <button
              type="button"
              onClick={onClose}
              className="mt-5 w-full text-center text-sm text-zinc-500 hover:text-zinc-800"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
