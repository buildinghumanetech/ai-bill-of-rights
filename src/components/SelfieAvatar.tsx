import { getActiveSelfieForSigner } from "@/lib/selfie/queries";

type Size = "sm" | "md" | "lg";

const DIMENSIONS: Record<Size, { px: number; classes: string }> = {
  sm: { px: 40, classes: "h-10 w-10 text-sm" },
  md: { px: 120, classes: "h-[120px] w-[120px] text-3xl" },
  lg: { px: 360, classes: "h-[360px] w-[360px] text-7xl" },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]![0]!.toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

interface Props {
  size: Size;
  signerId: string;
  displayName: string;
  /**
   * Optional pre-fetched map (used by list pages to avoid N+1). When provided,
   * the component reads from the map instead of querying the database.
   */
  preloadedActiveSelfies?: Map<
    string,
    { displayBlobUrl: string; thumbnailBlobUrl: string }
  >;
}

/**
 * Single source of truth for "render a signer's photo or initials placeholder."
 * Uses raw <img> intentionally — the Blob CDN URLs are stable per upload, and
 * adding the next/image optimization round-trip would add latency without much
 * payoff at these small avatar sizes.
 */
export async function SelfieAvatar({
  size,
  signerId,
  displayName,
  preloadedActiveSelfies,
}: Props) {
  const dims = DIMENSIONS[size];
  let url: string | null = null;

  if (preloadedActiveSelfies) {
    const entry = preloadedActiveSelfies.get(signerId);
    if (entry) {
      url = size === "sm" ? entry.thumbnailBlobUrl : entry.displayBlobUrl;
    }
  } else {
    const active = await getActiveSelfieForSigner(signerId);
    if (active) {
      url = size === "sm" ? active.thumbnailBlobUrl : active.displayBlobUrl;
    }
  }

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`${displayName}'s photo`}
        width={dims.px}
        height={dims.px}
        className={`shrink-0 rounded-full bg-zinc-100 object-cover ${dims.classes}`}
        loading="lazy"
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-zinc-200 to-zinc-300 font-semibold text-zinc-600 ${dims.classes}`}
    >
      {initials(displayName)}
    </div>
  );
}
