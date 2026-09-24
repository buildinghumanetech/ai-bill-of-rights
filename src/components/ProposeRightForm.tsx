"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { useAuth, useClerk, useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { submitNewRightAction } from "@/server/actions/proposals";
import {
  validateNewArticle,
  TITLE_MAX,
  BODY_MAX,
  RATIONALE_MAX,
  PULL_QUOTE_MAX,
  BODY_MIN,
} from "@/lib/proposals/validate";
import { LICENSE_FIELD, PROPOSAL_LICENSE } from "@/lib/proposals/license";

/**
 * Composer for a whole new Article.
 *
 * The four fields mirror the shape every article in v0.1.0 already has — a
 * name, the rule itself, an optional closing line — plus the one thing the
 * document cannot supply: why the existing eleven do not already cover this.
 * That last field is the whole point of the form. Nearly every proposal is a
 * restatement of Article 4 or Article 9, and asking for the distinction up
 * front is cheaper than asking for it in the comments afterwards.
 *
 * Number is not a field. It is assigned at publish time.
 */
const SIGN_IN_FIRST =
  "Sign in to file this — proposals are tied to a verified person. Your text stays on this page.";

/**
 * The draft survives the trip through signing in or signing: the modal is
 * in-page, but "switch account" signs out and reloads, and a refresh would
 * otherwise throw away a 1200-character proposal. sessionStorage, not
 * localStorage — it is this tab's draft, not something to resurrect next week.
 */
const DRAFT_KEY = "propose-right-draft";
type Draft = { title: string; body: string; rationale: string; pullQuote: string };

function readDraft(): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft> | null;
    if (!d || typeof d !== "object") return null;
    return {
      title: String(d.title ?? ""),
      body: String(d.body ?? ""),
      rationale: String(d.rationale ?? ""),
      pullQuote: String(d.pullQuote ?? ""),
    };
  } catch {
    return null;
  }
}

function writeDraft(d: Draft) {
  try {
    if (!d.title && !d.body && !d.rationale && !d.pullQuote) {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } else {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    }
  } catch {
    // Storage blocked (private mode, quota): the in-page draft still works.
  }
}

/** Opens the sign modal mounted on /propose (SignModalClient). */
function openSignModal(detail: { mode: "sign" | "comment-only"; signIn?: boolean }) {
  window.dispatchEvent(new CustomEvent("open-sign-modal", { detail }));
}
/** A returning signer: straight to the phone/email + code sign-in. */
const openSignIn = () => openSignModal({ mode: "comment-only", signIn: true });
/** Someone who has not signed: the full sign-the-bill flow. */
const openSign = () => openSignModal({ mode: "sign" });

const PRIMARY =
  "inline-block rounded-full bg-amber-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-800";
const SECONDARY = "font-semibold text-amber-900 underline underline-offset-4";

function SignInCta() {
  return (
    <button type="button" onClick={openSignIn} className={PRIMARY}>
      Sign in
    </button>
  );
}

function SignCta() {
  return (
    <button type="button" onClick={openSign} className={PRIMARY}>
      Sign the Bill of Rights
    </button>
  );
}

/**
 * Who is looking at the form, as far as the gate is concerned. "no-signer" is
 * the confusing one: a Clerk session with no signer row shows no "My Account"
 * pill anywhere on the site, so it looks exactly like being signed out.
 */
type Viewer = "loading" | "signed-out" | "no-signer" | "signer";

export function ProposeRightForm({
  onPosted,
  needsSignature = false,
}: {
  onPosted?: (id: string) => void;
  /**
   * Signed in, but with no signer row (known server-side). The server refuses
   * the submission in that case, so say so ABOVE the compose box — not after a
   * whole proposal has been written.
   */
  needsSignature?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rationale, setRationale] = useState("");
  const [pullQuote, setPullQuote] = useState("");
  const [draftReady, setDraftReady] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  // What the error offers, so a refusal is never a dead end.
  const [errorAction, setErrorAction] = useState<"sign-in" | "sign" | null>(null);
  const [posted, setPosted] = useState(false);
  const [pending, startTransition] = useTransition();
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const router = useRouter();

  const viewer: Viewer = !isLoaded
    ? "loading"
    : !isSignedIn
      ? "signed-out"
      : needsSignature
        ? "no-signer"
        : "signer";
  const accountLabel =
    user?.primaryEmailAddress?.emailAddress ?? user?.primaryPhoneNumber?.phoneNumber ?? null;

  // Restore after mount, not in the useState initialiser: the server renders
  // empty fields, and a different first client render is a hydration mismatch.
  useEffect(() => {
    const d = readDraft();
    if (d) {
      // Intentional, and the comment above says why: localStorage does not exist during
      // server render, so a draft can only be restored after mount. Putting it in the
      // useState initialiser would make the first client render differ from the server's.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle(d.title);
      setBody(d.body);
      setRationale(d.rationale);
      setPullQuote(d.pullQuote);
    }
    setDraftReady(true);
  }, []);

  // Gated on draftReady so the empty first render can't erase a saved draft.
  useEffect(() => {
    if (draftReady) writeDraft({ title, body, rationale, pullQuote });
  }, [draftReady, title, body, rationale, pullQuote]);

  // `needsSignature` comes from the server render. When the session changes in
  // the modal, re-render so the notice above the form reflects the new account.
  const lastSignedIn = useRef(isSignedIn);
  useEffect(() => {
    if (!isLoaded) return;
    if (lastSignedIn.current !== undefined && lastSignedIn.current !== isSignedIn) {
      router.refresh();
    }
    lastSignedIn.current = isSignedIn;
  }, [isLoaded, isSignedIn, router]);

  // Once the sign-in modal has done its job, the "sign in first" notice is
  // stale — hide it so the next thing they see is their own text and the
  // button, not an instruction they have already followed.
  // Only the client's own prompt: a server "not signed in" while Clerk says
  // signed in is an expired session, and hiding it would leave no way out.
  const signInErrorIsStale = isSignedIn && formError === SIGN_IN_FIRST;
  const shownFormError = signInErrorIsStale ? null : formError;

  async function switchAccount() {
    // Reloads onto /propose signed out; the draft comes back from storage.
    writeDraft({ title, body, rationale, pullQuote });
    await signOut({ redirectUrl: "/propose" });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setErrorAction(null);

    const check = validateNewArticle({ title, body, rationale, pullQuote });
    if (!check.ok) {
      setErrors(check.errors as Record<string, string>);
      return;
    }
    setErrors({});

    // `isSignedIn` is undefined until Clerk loads. Reading that as "signed
    // out" opened the create-account modal on people who were already signed
    // in, and pushed them into a sign-up Clerk refuses ("Session already
    // exists").
    if (!isLoaded) {
      setFormError("Still loading — try again in a moment.");
      return;
    }

    if (!isSignedIn) {
      // Signed out says nothing about whether they have signed — most people
      // who reach this form have. Offer sign-in first; the modal links on to
      // creating an account for anyone who hasn't.
      setFormError(SIGN_IN_FIRST);
      setErrorAction("sign-in");
      openSignIn();
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("title", title);
      fd.set("body", body);
      fd.set("rationale", rationale);
      fd.set("pullQuote", pullQuote);
      // The grant shown beside the button below. The server records it on the
      // row and refuses a submission that didn't carry it.
      fd.set(LICENSE_FIELD, PROPOSAL_LICENSE.id);
      const res = await submitNewRightAction(fd);
      if (!res.ok) {
        if (res.field) setErrors({ [res.field]: res.error ?? "" });
        else setFormError(res.error ?? "Couldn't file your proposal.");
        if (res.code === "not_signed_in") setErrorAction("sign-in");
        if (res.code === "not_signer") setErrorAction("sign");
        return;
      }
      setPosted(true);
      setTitle("");
      setBody("");
      setRationale("");
      setPullQuote("");
      writeDraft({ title: "", body: "", rationale: "", pullQuote: "" });
      router.refresh();
      if (res.id && onPosted) onPosted(res.id);
    });
  }

  if (posted) {
    return (
      <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-6">
        <p className="text-base font-semibold text-emerald-900">
          Filed. It&apos;s in the queue below.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-emerald-800">
          Other signers can now endorse it and argue with it. Proposals that
          hold up get folded into the next version.
        </p>
        <button
          type="button"
          onClick={() => setPosted(false)}
          className="mt-4 text-sm font-medium text-emerald-900 underline underline-offset-4"
        >
          Propose another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {viewer === "signed-out" && (
        <div
          role="status"
          className="space-y-3 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p>
            You&apos;re not signed in. Proposals are filed by signers, so sign
            in before you file. You can write your draft now; it stays on this
            page while you do.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <SignInCta />
            <span>
              Haven&apos;t signed yet?{" "}
              <button type="button" onClick={openSign} className={SECONDARY}>
                Sign the Bill of Rights
              </button>
            </span>
          </div>
        </div>
      )}

      {viewer === "no-signer" && (
        <div
          role="status"
          className="space-y-3 rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
        >
          <p>
            You&apos;re signed in
            {accountLabel ? (
              <>
                {" "}as <span className="font-semibold">{accountLabel}</span>
              </>
            ) : null}
            , but this account hasn&apos;t signed the Bill of Rights. Only
            signers can file a proposal. Your draft stays on this page.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <SignCta />
            <span>
              Signed with a different email or phone?{" "}
              <button type="button" onClick={switchAccount} className={SECONDARY}>
                Switch account
              </button>
            </span>
          </div>
        </div>
      )}

      <Field
        label="Name of the right"
        hint="Plain second person, like the other eleven. No number — that's assigned when it's published."
        error={errors.title}
        count={`${title.length}/${TITLE_MAX}`}
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={TITLE_MAX}
          placeholder="Your Mind Is Not a Customer"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none"
        />
      </Field>

      <Field
        label="The right itself"
        hint="What companies must and must not do. Write it as it would appear in the document."
        error={errors.body}
        count={`${body.length}/${BODY_MAX}${body.length < BODY_MIN ? ` — ${BODY_MIN} minimum` : ""}`}
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={BODY_MAX}
          rows={6}
          placeholder="No AI system may present uncertain knowledge with false confidence…"
          className="w-full rounded border border-zinc-300 px-3 py-2 text-base leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none"
        />
      </Field>

      <Field
        label="Why the existing eleven don't already cover this"
        hint="Be specific about the nearest article and how yours differs. Proposals that skip this get rejected in the comments."
        error={errors.rationale}
        count={`${rationale.length}/${RATIONALE_MAX}`}
      >
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          maxLength={RATIONALE_MAX}
          rows={4}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-base leading-relaxed text-zinc-900 focus:border-blue-500 focus:outline-none"
        />
      </Field>

      <Field
        label="Closing line (optional)"
        hint="Every article ends on one. “The loop stays open.” “You are not the experiment.”"
        error={errors.pullQuote}
        count={`${pullQuote.length}/${PULL_QUOTE_MAX}`}
      >
        <input
          type="text"
          value={pullQuote}
          onChange={(e) => setPullQuote(e.target.value)}
          maxLength={PULL_QUOTE_MAX}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-base text-zinc-900 focus:border-blue-500 focus:outline-none"
        />
      </Field>

      {shownFormError && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p>{shownFormError}</p>
          {errorAction && (
            <div className="mt-2">
              {errorAction === "sign-in" ? <SignInCta /> : <SignCta />}
            </div>
          )}
        </div>
      )}

      {/* The licence grant. It sits directly above the button, always
          visible, because submitting IS the act of consent — a grant hidden
          in a footer or behind a toggle is not one the person gave. */}
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-zinc-700">
          By submitting, you agree to license your proposed text under Creative
          Commons Attribution 4.0 International (
          <a
            href={PROPOSAL_LICENSE.url}
            target="_blank"
            rel="noopener noreferrer license"
            className="text-blue-600 underline underline-offset-4"
          >
            {PROPOSAL_LICENSE.shortName}
          </a>
          ), which allows it to be published and reused with credit to you.
        </p>
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-blue-600 px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "Filing…" : "File this proposal"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  count,
  children,
}: {
  label: string;
  hint: string;
  error?: string;
  count: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-semibold text-zinc-900">{label}</label>
      <p className="mb-2 mt-1 text-sm leading-relaxed text-zinc-600">{hint}</p>
      {children}
      <div className="mt-1 flex items-baseline justify-between gap-4">
        <span className="text-sm text-red-600">{error ?? ""}</span>
        <span className="shrink-0 font-mono text-xs text-zinc-400">{count}</span>
      </div>
    </div>
  );
}
