"use client";

import { FormEvent, useState, useTransition } from "react";
import { adminAddSignerAction } from "@/server/actions/admin";

const VERSION = "0.0.1";

type NameDisplayFormat = "initials" | "first-initial" | "full";

function formatNamePreview(
  first: string,
  last: string,
  format: NameDisplayFormat,
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

export default function AdminAddSignerForm() {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nameDisplayFormat, setNameDisplayFormat] =
    useState<NameDisplayFormat>("full");
  const [affiliation, setAffiliation] = useState("");
  const [locationText, setLocationText] = useState("");
  const [verificationMethod, setVerificationMethod] = useState<
    "email" | "sms"
  >("email");
  const [contactValue, setContactValue] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [notificationPreference, setNotificationPreference] = useState<
    "major" | "minor" | "none"
  >("major");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setFirstName("");
    setLastName("");
    setNameDisplayFormat("full");
    setAffiliation("");
    setLocationText("");
    setVerificationMethod("email");
    setContactValue("");
    setIsAdmin(false);
    setNotificationPreference("major");
    setError(null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }
    const displayName = formatNamePreview(
      firstName,
      lastName,
      nameDisplayFormat,
    );
    startTransition(async () => {
      const res = await adminAddSignerAction({
        displayName,
        affiliation,
        locationText,
        verificationMethod,
        contactValue,
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

  const namesReady = firstName.trim() && lastName.trim();

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
        Bypasses Clerk OTP. The contact value below is stored privately on
        the consent record (for outreach), not shown publicly.
      </p>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-zinc-700">
            First name <span className="text-red-600">*</span>
          </span>
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-zinc-700">
            Last name <span className="text-red-600">*</span>
          </span>
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>
      </div>

      {namesReady ? (
        <fieldset className="mt-5">
          <legend className="text-xs font-medium text-zinc-700">
            Show their name as
          </legend>
          <div className="mt-2 flex flex-col gap-1.5">
            {(["initials", "first-initial", "full"] as const).map(
              (value) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1 text-sm text-zinc-800 hover:bg-zinc-50"
                >
                  <input
                    type="radio"
                    name="admin-name-format"
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

      <fieldset className="mt-5">
        <legend className="text-xs font-medium text-zinc-700">
          Verified by
        </legend>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          {(
            [
              { v: "email", label: "Email" },
              { v: "sms", label: "Phone" },
            ] as const
          ).map((opt) => (
            <label
              key={opt.v}
              className="flex cursor-pointer items-center gap-2"
            >
              <input
                type="radio"
                name="verification-method"
                value={opt.v}
                checked={verificationMethod === opt.v}
                onChange={() => {
                  setVerificationMethod(opt.v);
                  setContactValue(""); // reset when method changes
                }}
                className="h-4 w-4 border-zinc-300 text-blue-600 focus:ring-blue-500/30"
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="mt-3 block">
        <span className="text-xs font-medium text-zinc-700">
          {verificationMethod === "email"
            ? "Email address (for outreach)"
            : "Phone number (for outreach)"}
        </span>
        <input
          type={verificationMethod === "email" ? "email" : "tel"}
          inputMode={verificationMethod === "email" ? "email" : "tel"}
          autoComplete={verificationMethod === "email" ? "email" : "tel"}
          value={contactValue}
          onChange={(e) => setContactValue(e.target.value)}
          placeholder={
            verificationMethod === "email"
              ? "someone@example.com"
              : "+1 555 123 4567"
          }
          className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
        <span className="mt-1 block text-xs text-zinc-500">
          Stored privately on the consent record for outreach. Not shown
          publicly.
        </span>
      </label>

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <label className="block">
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
