import { NextRequest, NextResponse } from "next/server";
import { getSignatureCount, listRecentSignersSince } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sinceParam = request.nextUrl.searchParams.get("since");
  let since: Date | null = null;
  if (sinceParam !== null) {
    const parsed = new Date(sinceParam);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Invalid 'since' parameter; expected ISO-8601 timestamp" },
        { status: 400 },
      );
    }
    since = parsed;
  }

  try {
    const [count, newSigners] = await Promise.all([
      getSignatureCount(),
      listRecentSignersSince(since),
    ]);
    return NextResponse.json(
      { count, newSigners },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/signers/recent] failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
