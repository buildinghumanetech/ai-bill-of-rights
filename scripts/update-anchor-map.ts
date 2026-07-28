/**
 * Regenerate tests/fixtures/published-anchor-map.json.
 *
 * Run this ONLY after deciding what happens to the comments on any anchor
 * whose text changed — the drift test names them, and this script is what
 * silences it. Running it first turns the tripwire into a rubber stamp.
 *
 *   pnpm anchors:snapshot
 */
import fs from "node:fs";
import path from "node:path";
import { anchorTextMap } from "@/app/anchor-map";

const OUT = path.join(process.cwd(), "tests", "fixtures", "published-anchor-map.json");

const next = anchorTextMap();
const prev: Record<string, string> = fs.existsSync(OUT)
  ? JSON.parse(fs.readFileSync(OUT, "utf8"))
  : {};

const moved = Object.keys(prev).filter((a) => a in next && prev[a] !== next[a]);
const removed = Object.keys(prev).filter((a) => !(a in next));
const added = Object.keys(next).filter((a) => !(a in prev));

fs.writeFileSync(OUT, JSON.stringify(next, null, 2) + "\n");

console.log(`wrote ${Object.keys(next).length} anchors to ${path.relative(process.cwd(), OUT)}`);
if (added.length) console.log(`  + ${added.length} new anchor(s)`);
if (moved.length) {
  console.log(`  ! ${moved.length} anchor(s) whose TEXT changed:`);
  for (const a of moved) console.log(`      ${a}`);
  console.log(`    Comments on these are now attached to different words.`);
}
if (removed.length) {
  console.log(`  - ${removed.length} anchor(s) removed:`);
  for (const a of removed) console.log(`      ${a}`);
  console.log(`    Comments on these render nowhere.`);
}
if (!added.length && !moved.length && !removed.length) console.log("  (no change)");
