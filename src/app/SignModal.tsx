"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useClerk, useSignIn, useSignUp, useUser } from "@clerk/nextjs";
import { recordSignatureFromModal } from "@/server/actions/sign-from-modal";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Step = "form" | "otp" | "done";
type Method = "email" | "phone";
type Flow = "signUp" | "signIn";

const VERSION = "1.0.0";

function clerkErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: Array<{ message?: string }> }).errors;
    if (errors && errors.length > 0 && errors[0].message) {
      return errors[0].message;
    }
  }
  if (err instanceof Error) return err.message;
  return "Something went wrong. Please try again.";
}

export default function SignModal({ open, onClose }: Props) {
  const { signUp, isLoaded: signUpLoaded, setActive: setSignUpActive } =
    useSignUp();
  const { signIn, isLoaded: signInLoaded, setActive: setSignInActive } =
    useSignIn();
  const { user, isSignedIn } = useUser();
  const { signOut } = useClerk();

  const [step, setStep] = useState<Step>("form");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [method, setMethod] = useState<Method>("email");
  const [identifier, setIdentifier] = useState("");
  const [shareLocation, setShareLocation] = useState(true);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [flow, setFlow] = useState<Flow>("signUp");

  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setStep("form");
      setCode("");
      setError(null);
      setLoading(false);
    }
  }, [open]);

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

  async function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // If the user is already authenticated (returning visitor or a stale
      // session from a prior attempt), skip OTP entirely and record the
      // signature against their existing Clerk identity.
      if (isSignedIn) {
        const res = await recordSignatureFromModal({
          firstName,
          lastName,
          method,
          shareLocation,
          versionString: VERSION,
        });
        if (!res.success) {
          setError(res.error ?? "We couldn't record your signature.");
          return;
        }
        setStep("done");
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
        const code =
          signUpErr &&
          typeof signUpErr === "object" &&
          "errors" in signUpErr &&
          Array.isArray(
            (signUpErr as { errors: Array<{ code?: string }> }).errors,
          )
            ? (signUpErr as { errors: Array<{ code?: string }> }).errors[0]
                ?.code
            : undefined;

        const alreadyExists =
          code === "form_identifier_exists" ||
          code === "form_identifier_exists__phone_number" ||
          code === "form_identifier_exists__email_address";

        if (alreadyExists && signInLoaded && signIn) {
          // Returning signer — switch to sign-in OTP.
          await signIn.create({
            identifier,
            strategy: method === "email" ? "email_code" : "phone_code",
          });
          setFlow("signIn");
          setStep("otp");
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
      let sessionId: string | undefined | null = null;

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

      // Hand off to the server action to record the signature.
      const res = await recordSignatureFromModal({
        firstName,
        lastName,
        method,
        shareLocation,
        versionString: VERSION,
      });

      if (!res.success) {
        setError(res.error ?? "We couldn't record your signature.");
        return;
      }
      setStep("done");
    } catch (err) {
      setError(clerkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  const isFormValid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    identifier.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-modal-title"
    >
      <div
        ref={dialogRef}
        className="relative w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl sm:p-8"
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

        {step === "form" && (
          <form onSubmit={handleFormSubmit} noValidate>
            <h2
              id="sign-modal-title"
              className="text-2xl font-semibold tracking-tight text-zinc-950"
            >
              Sign the AI Bill of Rights
            </h2>
            <p className="mt-1.5 text-sm text-zinc-600">
              Add your name to v{VERSION} of the document.
            </p>

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

            <fieldset className="mt-5">
              <legend className="text-sm font-medium text-zinc-700">
                Verify me via
              </legend>
              <div className="mt-2 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setMethod("email")}
                  className={`text-sm transition-colors ${
                    method === "email"
                      ? "font-semibold text-zinc-950"
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  Email
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMethod(method === "email" ? "phone" : "email")
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/30 ${
                    method === "phone" ? "bg-blue-600" : "bg-zinc-300"
                  }`}
                  aria-label="Toggle verification method"
                  role="switch"
                  aria-checked={method === "phone"}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                      method === "phone" ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => setMethod("phone")}
                  className={`text-sm transition-colors ${
                    method === "phone"
                      ? "font-semibold text-zinc-950"
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  Phone
                </button>
              </div>
            </fieldset>

            <div className="mt-4">
              <label className="block">
                <span className="sr-only">
                  {method === "email" ? "Email address" : "Phone number"}
                </span>
                <input
                  type={method === "email" ? "email" : "tel"}
                  inputMode={method === "email" ? "email" : "tel"}
                  autoComplete={method === "email" ? "email" : "tel"}
                  placeholder={
                    method === "email"
                      ? "you@example.com"
                      : "+1 555 123 4567"
                  }
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
            </div>

            <label className="mt-5 flex items-start gap-2.5 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={shareLocation}
                onChange={(e) => setShareLocation(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500/30"
              />
              <span>Share my approximate city &amp; state</span>
            </label>

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
              {loading ? "Sending code…" : "Sign"}
            </button>

            <p className="mt-3 text-center text-xs text-zinc-500">
              We&apos;ll {method === "email" ? "email" : "text"} you a 6-digit
              code to confirm your signature.
            </p>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleCodeSubmit}>
            <h2
              id="sign-modal-title"
              className="text-2xl font-semibold tracking-tight text-zinc-950"
            >
              Enter the code you received to confirm your signature
            </h2>
            <p className="mt-1.5 text-sm text-zinc-600">
              We sent a 6-digit code to{" "}
              <span className="font-medium text-zinc-900">{identifier}</span>.
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
              {loading ? "Confirming…" : "Confirm signature"}
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
          <div className="text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <svg
                className="h-7 w-7 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2.4"
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
              className="mt-5 text-2xl font-semibold tracking-tight text-zinc-950"
            >
              Thank you for signing.
            </h2>
            <p className="mt-2 text-sm text-zinc-600">
              Your name has been added to v{VERSION} of the AI Bill of Rights.
              We just sent a confirmation to your{" "}
              {method === "email" ? "email" : "phone"}.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-full bg-zinc-900 px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-zinc-700"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
