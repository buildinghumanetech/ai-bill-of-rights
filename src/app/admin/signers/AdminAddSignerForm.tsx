"use client";

import { FormEvent, useState, useTransition } from "react";
import { adminAddSignerAction } from "@/server/actions/admin";

const VERSION = "1.0.0";

export default function AdminAddSignerForm() {
  const [open, setOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [locationText, setLocationText] = useState("");
  const [verificationMethod, setVerificationMethod] = useState<
    "email" | "sms"
  >("email");
  const [isAdmin, setIsAdmin] = useState(false);
  const [notificationPreference, setNotificationPreference] = useState<
    "major" | "minor" | "none"
  >("major");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setDisplayName("");
    setAffiliation("");
    setLocationText("");
    setVerificationMethod("email");
    setIsAdmin(false);
    setNotificationPreference("major");
    setError(null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }
    startTransition(async () => {
      const res = await adminAddSignerAction({
        displayName,
        affiliation,
        locationText,
        verificationMethod,
        isAdmin,
        notificationPreference,
        versionString: VERSION,
      });
      if (!res.success) {
        setError(res.error ?? "Couldn't add signer.");
        return;
      }
      reset();
      setOpen(false);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
      >
        + Add signer manually
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
    >
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-zinc-950">
          Add signer manually
        </h2>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="text-xs text-zinc-500 hover:text-zinc-900"
        >
          Cancel
        </button>
      </div>
      <p className="mt-1 text-xs text-zinc-500">
        Bypasses Clerk OTP. The signer is recorded as verified by whichever
        method you select — your word, on your account.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-zinc-700">
            Display name <span className="text-red-600">*</span>
          </span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            placeholder="Daniel O."
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-zinc-700">
            Affiliation
          </span>
          <input
            type="text"
            value={affiliation}
            onChange={(e) => setAffiliation(e.target.value)}
            placeholder="Building Humane Technology"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-medium text-zinc-700">Location</span>
          <input
            type="text"
            value={locationText}
            onChange={(e) => setLocationText(e.target.value)}
            placeholder="San Francisco, California, USA"
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>
      </div>

      <fieldset className="mt-5">
        <legend className="text-xs font-medium text-zinc-700">
          Verified by
        </legend>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          {(["email", "sms"] as const).map((v) => (
            <label key={v} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="verification-method"
                value={v}
                checked={verificationMethod === v}
                onChange={() => setVerificationMethod(v)}
                className="h-4 w-4 border-zinc-300 text-blue-600 focus:ring-blue-500/30"
              />
              <span>{v === "email" ? "Email" : "Phone"}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-xs font-medium text-zinc-700">
          Notification preference
        </legend>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          {(
            [
              { v: "major", label: "Major" },
              { v: "minor", label: "Minor" },
              { v: "none", label: "None" },
            ] as const
          ).map((opt) => (
            <label
              key={opt.v}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                type="radio"
                name="notification-preference"
                value={opt.v}
                checked={notificationPreference === opt.v}
                onChange={() => setNotificationPreference(opt.v)}
                className="h-4 w-4 border-zinc-300 text-blue-600 focus:ring-blue-500/30"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-5 flex cursor-pointer items-center gap-2 text-sm text-zinc-800">
        <input
          type="checkbox"
          checked={isAdmin}
          onChange={(e) => setIsAdmin(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-300 text-blue-600 focus:ring-blue-500/30"
        />
        <span>Grant admin role to this signer</span>
      </label>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-6 flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add signer + signature"}
        </button>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="rounded-full bg-zinc-100 px-6 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
