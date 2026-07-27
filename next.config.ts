import type { NextConfig } from "next";

/**
 * Resource pages renamed when v0.1.0 adopted HumaneBench's own eight principle
 * names in place of this repo's internal shorthand.
 *
 * The old slugs were live and linked from the homepage, so they are in
 * people's history and in anything they shared. Deleting the files without
 * these leaves a 404 at a URL that used to work. `permanent: true` (308) is
 * right because the rename is not coming back.
 *
 * Honesty and Transparency were two pages for what is actually ONE principle
 * — Be Transparent and Honest — so both old slugs land on the merged page.
 */
export const RESOURCE_SLUG_REDIRECTS: Record<string, string> = {
  "humanebench-principle-dignity": "humanebench-principle-protect-dignity-and-safety",
  "humanebench-principle-empowerment": "humanebench-principle-enhance-human-capabilities",
  "humanebench-principle-honesty": "humanebench-principle-be-transparent-and-honest",
  "humanebench-principle-transparency": "humanebench-principle-be-transparent-and-honest",
  "humanebench-principle-non-manipulation": "humanebench-principle-enable-meaningful-choices",
  "humanebench-respect-user-attention": "humanebench-principle-respect-user-attention",
};

const nextConfig: NextConfig = {
  async redirects() {
    return Object.entries(RESOURCE_SLUG_REDIRECTS).map(([from, to]) => ({
      source: `/resources/${from}`,
      destination: `/resources/${to}`,
      permanent: true,
    }));
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
