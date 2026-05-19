"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitSelfieAction } from "@/server/actions/selfie";

interface Props {
  /**
   * - post-sign: own card with heading + disclaimer (used on /sign/complete).
   * - account: own card, parent provides the heading (used in <SelfieCard/>).
   * - modal: NO outer card and NO heading — parent (e.g. the sign-confirmation
   *   modal) provides both. Disclaimer still shown inline near the buttons.
   */
  context: "post-sign" | "account" | "modal";
}

type Stage =
  | { kind: "choose" }
  | { kind: "live"; stream: MediaStream }
  | { kind: "preview"; blob: Blob; previewUrl: string; captureMethod: "live" | "upload" }
  | { kind: "submitted" }
  | { kind: "error"; message: string };

// Lazy initial check: getUserMedia presence doesn't change after mount, so we
// can compute it once during render (works in SSR too — returns true on the
// server, which falls back to the actual check on the client via startLive's
// try/catch).
function detectCameraSupport(): boolean {
  if (typeof navigator === "undefined") return true;
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

export function SelfieCapture({ context }: Props) {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const [pending, startTransition] = useTransition();
  const [cameraSupported, setCameraSupported] = useState<boolean>(
    detectCameraSupport,
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Stop the camera stream and revoke any blob URL when transitioning out.
  useEffect(() => {
    return () => {
      if (stage.kind === "live") {
        stage.stream.getTracks().forEach((t) => t.stop());
      }
      if (stage.kind === "preview") {
        URL.revokeObjectURL(stage.previewUrl);
      }
    };
  }, [stage]);

  // Once the live stage is active, attach the stream to the <video> element.
  useEffect(() => {
    if (stage.kind === "live" && videoRef.current) {
      videoRef.current.srcObject = stage.stream;
    }
  }, [stage]);

  async function startLive() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      setStage({ kind: "live", stream });
    } catch {
      setCameraSupported(false);
      setStage({
        kind: "error",
        message: "Couldn't open the camera. Try uploading a photo instead.",
      });
    }
  }

  async function capture() {
    if (stage.kind !== "live") return;
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) return;
    stage.stream.getTracks().forEach((t) => t.stop());
    const previewUrl = URL.createObjectURL(blob);
    setStage({
      kind: "preview",
      blob,
      previewUrl,
      captureMethod: "live",
    });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setStage({
      kind: "preview",
      blob: file,
      previewUrl,
      captureMethod: "upload",
    });
  }

  function reset() {
    if (stage.kind === "live") stage.stream.getTracks().forEach((t) => t.stop());
    if (stage.kind === "preview") URL.revokeObjectURL(stage.previewUrl);
    setStage({ kind: "choose" });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (stage.kind !== "preview") return;
    const form = new FormData();
    const ext = stage.blob.type.includes("png") ? "png" : "jpg";
    form.set(
      "photo",
      new File([stage.blob], `selfie.${ext}`, {
        type: stage.blob.type || "image/jpeg",
      }),
    );
    form.set("captureMethod", stage.captureMethod);
    const previewUrl = stage.previewUrl;
    startTransition(async () => {
      const res = await submitSelfieAction(form);
      if (res.success) {
        URL.revokeObjectURL(previewUrl);
        setStage({ kind: "submitted" });
        // Refresh server-rendered parents (e.g. SelfieCard on /account)
        // so they pick up the new pending row.
        router.refresh();
      } else {
        setStage({ kind: "error", message: friendlyError(res.error) });
      }
    });
  }

  const containerClass =
    context === "modal" ? "" : "rounded-2xl border border-zinc-200 bg-white p-6";

  return (
    <div className={containerClass}>
      {context === "post-sign" ? (
        <>
          <h2 className="text-xl font-semibold text-zinc-950">
            Add your photo{" "}
            <span className="font-normal text-zinc-400">(optional)</span>
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Put a face to your name on your signer profile. Submitted photos
            are briefly reviewed by an admin before they go live.
          </p>
        </>
      ) : null}

      {stage.kind === "choose" ? (
        <div className={context === "post-sign" ? "mt-5" : context === "modal" ? "" : ""}>
          <div className="flex flex-col gap-3 sm:flex-row">
            {cameraSupported ? (
              <button
                type="button"
                onClick={startLive}
                className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
              >
                Take photo
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-100"
            >
              {cameraSupported ? "Upload existing photo" : "Upload a photo"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={onFileChange}
              className="hidden"
            />
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            Your photo will be shown on your public profile after a brief
            admin review. You can remove it anytime from your account. We do
            not run face recognition and do not share your photo with third
            parties.
          </p>
        </div>
      ) : null}

      {stage.kind === "live" ? (
        <div className="mt-5">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="mx-auto aspect-square w-full max-w-sm rounded-2xl bg-zinc-100 object-cover"
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={capture}
              className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              Capture
            </button>
            <button
              type="button"
              onClick={reset}
              className="text-sm text-zinc-600 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {stage.kind === "preview" ? (
        <div className="mt-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={stage.previewUrl}
            alt="Preview"
            className="mx-auto aspect-square w-full max-w-sm rounded-2xl object-cover"
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "Submitting…" : "Submit photo"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="text-sm text-zinc-600 hover:underline"
            >
              Choose different
            </button>
          </div>
        </div>
      ) : null}

      {stage.kind === "submitted" ? (
        <div className="rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <span className="font-medium">Photo submitted!</span> An admin will
          review it shortly. We&apos;ll email you once it&apos;s live on your
          profile.
        </div>
      ) : null}

      {stage.kind === "error" ? (
        <div className="mt-5 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {stage.message}{" "}
          <button
            type="button"
            onClick={reset}
            className="font-medium underline"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}

function friendlyError(raw: string): string {
  if (raw.includes("too_large"))
    return "That photo is too large. Please pick one under 10 MB.";
  if (raw.includes("disallowed_mime"))
    return "We accept JPEG, PNG, WebP, and HEIC photos.";
  if (raw.includes("empty")) return "The file you picked is empty.";
  if (raw.includes("too_pixels"))
    return "That photo has unusually large dimensions. Please use a smaller one.";
  if (raw.toLowerCase().includes("rate"))
    return "You've submitted a lot of photos recently. Take a break and try again in an hour.";
  return raw;
}
