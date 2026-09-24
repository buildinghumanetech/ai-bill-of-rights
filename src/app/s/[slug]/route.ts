import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db/lazy";
import { resolveShareSlug } from "@/lib/share/short-links";
import { parseChannel, withShareParams } from "@/lib/share/urls";

export const dynamic = "force-dynamic";

/**
 * theaibill.org/s/<slug>?via=x → /signatories/<id>?ref=<id>&via=x.
 *
 * The redirect target carries ?ref= on purpose: proxy.ts sets the first-touch
 * attribution cookie from the query string of the request it sees, so landing
 * on the long URL is what credits the sharer — same as a long link would.
 *
 * An unknown slug (or a missing share_links table) goes to the homepage rather
 * than a 404: whoever clicked still came to sign.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/s/[slug]">) {
  const { slug } = await ctx.params;
  const signerId = await resolveShareSlug(getDb(), slug);
  const channel = parseChannel(req.nextUrl.searchParams) ?? undefined;
  const target = signerId
    ? withShareParams(`/signatories/${signerId}`, { ref: signerId, channel })
    : withShareParams("/", { channel });
  return NextResponse.redirect(new URL(target, req.url), 307);
}
