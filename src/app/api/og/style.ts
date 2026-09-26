import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The site's look for generated share cards (the "I signed" card and the
 * scorecard cards), so they read as the same product as the pages: light gray
 * band, near-black type, blue accent, Geist. No green anywhere.
 *
 * Satori only takes literal colors, so these are hex values copied from the
 * Tailwind palette the site uses (zinc and blue).
 */
export const OG_COLORS = {
  band: "#fafafa", // zinc-50
  bandBorder: "#e4e4e7", // zinc-200
  tag: "#71717a", // zinc-500
  ink: "#09090b", // zinc-950
  body: "#27272a", // zinc-800
  muted: "#71717a", // zinc-500
  blue: "#2563eb", // blue-600
  blueTint: "#dbeafe", // blue-100
  white: "#ffffff",
} as const;

export const OG_TAG = "The People's AI Bill of Rights";

type OgFont = {
  name: string;
  data: Buffer;
  weight: 400 | 600 | 700;
  style: "normal";
};

let geist: Promise<OgFont[]> | null = null;

/**
 * Geist, as the site sets it (next/font/google in the root layout). Satori
 * cannot fake bold, so each weight the cards use is a real file. The files
 * live in assets/fonts (OFL-licensed, from Google Fonts) and are traced into
 * the OG routes by next.config.ts. Loaded once per server instance.
 */
export function loadGeist(): Promise<OgFont[]> {
  geist ??= Promise.all(
    (
      [
        [400, "Geist-Regular.ttf"],
        [600, "Geist-SemiBold.ttf"],
        [700, "Geist-Bold.ttf"],
      ] as const
    ).map(async ([weight, file]) => ({
      name: "Geist",
      data: await readFile(join(process.cwd(), "assets/fonts", file)),
      weight,
      style: "normal" as const,
    })),
  ).catch((err) => {
    // Let the next request try again rather than caching a failure.
    geist = null;
    throw err;
  });
  return geist;
}
