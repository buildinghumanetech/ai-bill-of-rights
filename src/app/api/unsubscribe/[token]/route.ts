import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/lib/db/lazy";
import { unsubscribeByToken } from "@/server/email/campaign";

export const dynamic = "force-dynamic";

/**
 * One-click unsubscribe from version emails: sets the signer's
 * notification_preference to 'none'.
 *
 * Three callers, one effect:
 *  - mail clients' native button (RFC 8058 List-Unsubscribe-Post), which POSTs
 *    the form body "List-Unsubscribe=One-Click" and expects a 2xx;
 *  - /unsubscribe/<token>, which POSTs here from the page as it loads;
 *  - that page's no-JavaScript form, which is sent back to the page.
 *
 * POST only. A GET that unsubscribes would be triggered by the link scanners
 * many inboxes run on incoming mail.
 */
// Typed by hand rather than with Next's generated `RouteContext` global, which
// only exists after `next dev`/`next build` — CI typechecks without either.
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  let ok: boolean;
  try {
    ok = await unsubscribeByToken(getDb(), token);
  } catch (err) {
    console.error("[unsubscribe] failed:", err);
    return NextResponse.json({ ok: false, error: "server" }, { status: 500 });
  }

  const isForm = (req.headers.get("content-type") ?? "").includes(
    "application/x-www-form-urlencoded",
  );
  const body = isForm ? await req.text() : "";
  if (isForm && !body.includes("List-Unsubscribe=One-Click")) {
    const page = new URL(`/unsubscribe/${encodeURIComponent(token)}`, req.url);
    page.searchParams.set(ok ? "done" : "invalid", "1");
    return NextResponse.redirect(page, 303);
  }
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}
