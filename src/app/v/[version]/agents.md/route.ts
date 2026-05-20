import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ version: string }> },
) {
  const { version } = await ctx.params;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return new Response("Not found", { status: 404 });
  }
  const filePath = path.join(
    process.cwd(),
    "content/bill-of-rights",
    `v${version}.agents.md`,
  );
  if (!fs.existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return new Response(content, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });
}
