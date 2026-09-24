"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  removeMySignatureForVersionAction,
  updateMyProfileAction,
} from "@/server/actions/account";
import { deleteMyAccount } from "@/server/actions/me";
import { saveWhyISigned } from "@/server/actions/why-i-signed";
import { MAX_WHY_I_SIGNED_LENGTH } from "@/lib/why-i-signed";
import { SelfieCard, type SelfieCardData } from "@/components/SelfieCard";

interface Signature {
  version: string;
  signedAt: string;
}

interface Props {
  initialDisplayName: string;
  initialAffiliation: string | null;
  initialLocationText: string | null;
  initialWhyISigned: string | null;
  verificationMethod: string;
  signatures: Signature[];
  selfieCard: SelfieCardData;
}

export default function AccountClient({
  initialDisplayName,
  initialAffiliation,
  initialLocationText,
  initialWhyISigned,
  verificationMethod,
  signatures: initialSignatures,
  selfieCard,
}: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [affiliation, setAffiliation] = useState(initialAffiliation ?? "");
  const [locationText, setLocationText] = useState(initialLocationText ?? "");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNote, setProfileNote] = useState<string | null>(null);
  const [profilePending, startProfileTransition] = useTransition();

  const [signatures, setSignatures] = useState<Signature[]>(initialSignatures);

  // "Why I signed" — editable and removable from here. The statement is public
  // (signer page, OG card, share copy), so someone who regrets what they wrote
  // needs a way to change or take it down that doesn't involve emailing us.
  const [whyISigned, setWhyISigned] = useState(initialWhyISigned ?? "");
  const [savedWhyISigned, setSavedWhyISigned] = useState(
    initialWhyISigned ?? "",
  );
  const [whyError, setWhyError] = useState<string | null>(null);
  const [whyNote, setWhyNote] = useState<string | null>(null);
  const [whyPending, startWhyTransition] = useTransition();

  const { signOut } = useClerk();
  const router = useRouter();
  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }
  const [removingVersion, setRemovingVersion] = useState<string | null>(null);

  // "Delete my account" — the full hard-delete cascade. Two clicks: the first
  // only reveals the confirmation block listing everything that goes.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleDeleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await deleteMyAccount();
      if (!res.success) {
        setDeleteError(res.error ?? "Couldn't delete your account.");
        return;
      }
      // The signer row is gone, so this page has nothing left to show.
      router.push("/");
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Couldn't delete your account.",
      );
    } finally {
      setDeleting(false);
    }
  }

  function handleProfileSave(e: FormEvent) {
    e.preventDefault();
    setProfileError(null);
    setProfileNote(null);
    startProfileTransition(async () => {
      const res = await updateMyProfileAction({
        displayName,
        affiliation,
        locationText,
      });
      if (!res.success) {
        setProfileError(res.error ?? "Couldn't save.");
        return;
      }
      setProfileNote("Saved.");
    });
  }

  /**
   * Save or clear the statement. `next` is the raw text; the empty string is
   * the clear path — the server action normalises "" to SQL NULL. Everything
   * that matters (sanitising, the cap, the rate limit) is enforced server-side;
   * the counter below is a courtesy, exactly as in the sign modal.
   */
  function submitWhyISigned(next: string, successNote: string) {
    setWhyError(null);
    setWhyNote(null);
    startWhyTransition(async () => {
      const res = await saveWhyISigned(next);
      if (!res.success) {
        setWhyError(res.error ?? "Couldn't save that.");
        return;
      }
      const stored = res.whyISigned ?? "";
      setWhyISigned(stored);
      setSavedWhyISigned(stored);
      setWhyNote(
        res.truncated
          ? `Saved — trimmed to ${MAX_WHY_I_SIGNED_LENGTH} characters.`
          : successNote,
      );
    });
  }

  /**
   * True when the textarea holds exactly what is already stored, i.e. there is
   * nothing to save. Saving it anyway would spend one of the ten hourly edits
   * on a write that changes nothing, so ten idle clicks of "Update" — no typing
   * at all — would lock the signer out of changing their statement for an hour.
   */
  const whyUnchanged = whyISigned === savedWhyISigned;

  function handleWhySave(e: FormEvent) {
    e.preventDefault();
    // The button below is disabled in these cases; this is the belt to its
    // braces, since a form can be submitted by routes other than that button.
    if (whyUnchanged || whyISigned.trim().length === 0) return;
    submitWhyISigned(whyISigned, "Saved.");
  }

  function handleWhyRemove() {
    const confirmed = window.confirm(
      "Remove your statement? It will disappear from your public page and your share card.",
    );
    if (!confirmed) return;
    submitWhyISigned("", "Removed.");
  }

  async function handleRemoveVersion(version: string) {
    // Say what this does NOT do as plainly as what it does. The sign modal used
    // to put "Delete my account" where people went to remove a signature, and
    // someone lost their whole account that way. This removes one signature
    // row; removeMySignatureForVersionAction keeps the signer, profile,
    // comments and statement.
    const others = signatures.some((s) => s.version !== version);
    const confirmed = window.confirm(
      `Remove your signature from v${version}? Your account, profile, comments and 'why I signed' statement stay, and you can sign again any time.` +
        (others ? " Your signatures on other versions stay." : ""),
    );
    if (!confirmed) return;
    setRemovingVersion(version);
    const res = await removeMySignatureForVersionAction(version);
    setRemovingVersion(null);
    if (!res.success) {
      window.alert(res.error ?? "Couldn't remove signature.");
      return;
    }
    setSignatures((prev) => prev.filter((s) => s.version !== version));
  }

  return (
    <>
      <form
        onSubmit={handleProfileSave}
        className="mt-8 rounded-2xl border border-zinc-200 bg-white p-6"
      >
        <h2 className="text-xl font-semibold text-zinc-950">Public profile</h2>
        <label className="mt-4 block">
          <span className="text-xs font-medium text-zinc-700">
            Display name <span className="text-red-600">*</span>
          </span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>
        <label className="mt-4 block">
          <span className="text-xs font-medium text-zinc-700">Affiliation</span>
          <input
            type="text"
            value={affiliation}
            onChange={(e) => setAffiliation(e.target.value)}
            placeholder="(optional)"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>
        <label className="mt-4 block">
          <span className="text-xs font-medium text-zinc-700">Location</span>
          <input
            type="text"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            placeholder="(optional)"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>
        <p className="mt-4 text-xs text-zinc-500">
          Verified via: <span className="font-medium">{verificationMethod}</span>
        </p>
        {profileError ? (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {profileError}
          </p>
        ) : null}
        {profileNote ? (
          <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {profileNote}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={profilePending}
            className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {profilePending ? "Saving…" : "Save"}
          </button>
        </div>
      </form>

      <form
        onSubmit={handleWhySave}
        className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6"
      >
        <h2 className="text-xl font-semibold text-zinc-950">Why you signed</h2>
        <p className="mt-1 text-xs text-emerald-900">
          One sentence, in your own words. It appears on your public signature
          page, on your share card, and in the text people see when you share.
        </p>
        <label className="mt-4 block">
          <span className="sr-only">Why you signed</span>
          <textarea
            id="account-why-i-signed"
            rows={3}
            maxLength={MAX_WHY_I_SIGNED_LENGTH}
            value={whyISigned}
            onChange={(e) => setWhyISigned(e.target.value)}
            placeholder="Because my kids will grow up with this technology and I want it on their side."
            className="mt-1 w-full resize-none rounded-lg border border-emerald-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </label>
        <div className="mt-1 flex items-center justify-between gap-3">
          <span
            className={`text-xs ${
              whyISigned.length >= MAX_WHY_I_SIGNED_LENGTH
                ? "font-medium text-amber-700"
                : "text-zinc-500"
            }`}
          >
            {whyISigned.length}/{MAX_WHY_I_SIGNED_LENGTH}
          </span>
          <div className="flex items-center gap-2">
            {savedWhyISigned ? (
              <button
                type="button"
                onClick={handleWhyRemove}
                disabled={whyPending}
                className="rounded-full border border-red-200 bg-white px-4 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Remove
              </button>
            ) : null}
            <button
              type="submit"
              disabled={
                whyPending || whyUnchanged || whyISigned.trim().length === 0
              }
              className="rounded-full bg-emerald-600 px-5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {whyPending ? "Saving…" : savedWhyISigned ? "Update" : "Save"}
            </button>
          </div>
        </div>
        {whyError ? (
          <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
            {whyError}
          </p>
        ) : null}
        {whyNote ? (
          <p className="mt-3 rounded-md bg-emerald-100 px-3 py-2 text-xs text-emerald-900">
            {whyNote}
          </p>
        ) : null}
      </form>

      <SelfieCard initial={selfieCard} />

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-zinc-950">Your signatures</h2>
        {signatures.length === 0 ? (
          <p className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            You currently have no signatures.{" "}
            <Link href="/" className="underline underline-offset-4">
              Sign the AI Bill of Rights
            </Link>
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {signatures.map((s) => (
              <li
                key={s.version + s.signedAt}
                className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 px-4 py-2 text-sm"
              >
                <span>
                  <Link
                    href={`/v/${s.version}`}
                    className="font-medium text-zinc-900 underline-offset-4 hover:underline"
                  >
                    v{s.version}
                  </Link>{" "}
                  <span className="text-zinc-500">
                    — signed {s.signedAt.slice(0, 10)}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveVersion(s.version)}
                  disabled={removingVersion === s.version}
                  className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20 hover:bg-red-100 disabled:opacity-50"
                >
                  {removingVersion === s.version
                    ? "Removing…"
                    : `Remove my signature from v${s.version}`}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-12 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
        <button
          type="button"
          onClick={handleSignOut}
          className="self-start rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 sm:self-auto"
        >
          Sign out
        </button>
        {/*
          /account/revoke does NOT delete anything wholesale. submitRevokeAction
          calls anonymizeSigner (src/server/signers/anonymize.ts): the signature
          stays and still counts, relabelled "Anonymized signer #N"; name,
          location and affiliation come off the public list; the private capture
          fields are scrubbed; photos are deleted. That is what
          content/consent/v1.md promises revoking does. The full hard delete is
          "Delete my account" below. Keep this label in step with the list on
          src/app/account/revoke/page.tsx.
        */}
        <Link
          href="/account/revoke"
          className="text-sm font-medium text-red-700 underline-offset-4 hover:underline"
        >
          Revoke consent: anonymize my signature and remove my personal data →
        </Link>
      </section>

      <section
        aria-labelledby="delete-account-heading"
        className="mt-10 border-t border-zinc-200 pt-8"
      >
        <h2
          id="delete-account-heading"
          className="text-base font-semibold text-red-800"
        >
          Delete your account
        </h2>
        {deleteError ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {deleteError}
          </p>
        ) : null}
        {confirmingDelete ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-5">
            {/*
              This button does NOT just remove a signature — it runs the
              full account cascade in src/server/signers/delete.ts. The
              copy has to name everything that cascade destroys, or people
              are consenting to something the dialog never described.
              If you widen the cascade, widen this list in the same commit.
            */}
            <p className="text-sm font-semibold text-red-900">
              Delete your account and everything in it?
            </p>
            {/*
              Says "every version" explicitly. deleteMyAccount deletes the
              signer row and EVERY signature it owns — someone reading
              "your signature" next to a version number reasonably takes it
              to mean that one. The wording is what prevents that reading.
            */}
            <p className="mt-1 text-sm text-red-800">
              This is irreversible. It permanently deletes:
            </p>
            <ul className="mt-2 list-disc pl-5 text-sm text-red-800">
              <li>
                Your signature on{" "}
                <strong className="font-semibold">every version</strong> you
                have signed, and your
                name, location and affiliation from the public signers list
              </li>
              <li>Your profile photo, including all backup copies</li>
              <li>
                Every comment you&apos;ve written, and every proposed edit
                you&apos;ve made
              </li>
              <li>
                Your votes, upvotes and endorsements, and your
                &ldquo;why I signed&rdquo; statement
              </li>
              <li>
                <strong className="font-semibold">
                  Other people&apos;s comments on your proposals
                </strong>{" "}
                — their replies to your proposed edits go with the proposal
              </li>
            </ul>
            <p className="mt-2 text-sm text-red-800">
              Replies other people wrote to your comments are kept. Your
              email or phone is freed up, so you can sign again later.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex-1 rounded-full bg-red-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Yes, delete everything"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className="flex-1 rounded-full bg-white px-6 py-2.5 text-sm font-medium text-zinc-900 ring-1 ring-inset ring-zinc-300 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setConfirmingDelete(true);
            }}
            className="mt-4 rounded-full bg-red-50 px-6 py-3 text-sm font-semibold text-red-700 ring-1 ring-inset ring-red-200 transition-colors hover:bg-red-100"
          >
            Delete my account
          </button>
        )}
      </section>
    </>
  );
}
