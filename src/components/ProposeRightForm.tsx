"use client";

import { FormEvent, useState, useTransition } from "react";
import { useAuth } from "@clerk/nextjs";
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
  "Sign in or create an account first — proposals are tied to a verified person. Your text stays on this page.";

export function ProposeRightForm({ onPosted }: { onPosted?: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rationale, setRationale] = useState("");
  const [pullQuote, setPullQuote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [posted, setPosted] = useState(false);
  const [pending, startTransition] = useTransition();
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  // Once the sign-in modal has done its job, the "sign in first" notice is
  // stale — hide it so the next thing they see is their own text and the
  // button, not an instruction they have already followed.
  const shownFormError =
    isSignedIn && formError === SIGN_IN_FIRST ? null : formError;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

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
      // No draft-and-return here, unlike NewCommentForm: a 1200-character
      // proposal in localStorage is a different size of object from a comment
      // draft, and the sign flow is short. Say so rather than silently
      // discarding it on the way through.
      setFormError(SIGN_IN_FIRST);
      window.dispatchEvent(
        new CustomEvent("open-sign-modal", { detail: { mode: "comment-only" } }),
      );
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
        return;
      }
      setPosted(true);
      setTitle("");
      setBody("");
      setRationale("");
      setPullQuote("");
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
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {shownFormError}
        </p>
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
