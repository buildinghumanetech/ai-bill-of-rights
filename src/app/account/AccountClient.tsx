"use client";

import { FormEvent, useState, useTransition } from "react";
import Link from "next/link";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  removeMySignatureForVersionAction,
  updateMyProfileAction,
} from "@/server/actions/account";

interface Signature {
  version: string;
  signedAt: string;
}

interface Props {
  initialDisplayName: string;
  initialAffiliation: string | null;
  initialLocationText: string | null;
  verificationMethod: string;
  signatures: Signature[];
}

export default function AccountClient({
  initialDisplayName,
  initialAffiliation,
  initialLocationText,
  verificationMethod,
  signatures: initialSignatures,
}: Props) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [affiliation, setAffiliation] = useState(initialAffiliation ?? "");
  const [locationText, setLocationText] = useState(initialLocationText ?? "");
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNote, setProfileNote] = useState<string | null>(null);
  const [profilePending, startProfileTransition] = useTransition();

  const [signatures, setSignatures] = useState<Signature[]>(initialSignatures);

  const { signOut } = useClerk();
  const router = useRouter();
  async function handleSignOut() {
    await signOut();
    router.push("/");
    router.refresh();
  }
  const [removingVersion, setRemovingVersion] = useState<string | null>(null);

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

  async function handleRemoveVersion(version: string) {
    const confirmed = window.confirm(
      `Remove your signature on v${version}? This deletes that one signature; your other version signatures stay.`,
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
                  aria-label={`Remove my signature on v${s.version}`}
                >
                  {removingVersion === s.version ? "…" : "×"}
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
        <Link
          href="/account/revoke"
          className="text-sm font-medium text-red-700 underline-offset-4 hover:underline"
        >
          Remove all my signatures and delete my profile →
        </Link>
      </section>
    </>
  );
}
