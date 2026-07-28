import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { anchorTextMap } from "@/app/anchor-map";

/**
 * The tripwire for silent comment re-attachment.
 *
 * A comment stores an anchor id, not the words it was written about. Edit the
 * words in that slot and the comment quietly ends up under different text —
 * no error, no red, and the author appears to have replied to something they
 * never read. This is invisible by construction, which is why it needs a test
 * rather than a reviewer's attention.
 *
 * The snapshot is the anchor -> text mapping of the PUBLISHED document. When
 * this fails, that is not a problem with the test: it is the one moment anyone
 * gets to decide what happens to the comments sitting on the anchors it names.
 */

const SNAPSHOT = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "published-anchor-map.json",
);

function snapshot(): Record<string, string> {
  return JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));
}

describe("comment anchor drift", () => {
  it("has not moved text under any anchor the published document already had", () => {
    const before = snapshot();
    const after = anchorTextMap();

    const moved = Object.keys(before)
      .filter((a) => a in after && before[a] !== after[a])
      .map((a) => `  ${a}\n    was: "${before[a]}"\n    now: "${after[a]}"`);

    expect(
      moved,
      moved.length === 0
        ? ""
        : `\n\nText changed under ${moved.length} existing comment anchor(s):\n\n${moved.join(
            "\n",
          )}\n\nAny comment on these is now attached to different words.\n` +
            `Decide, per anchor, before regenerating the snapshot:\n` +
            `  - Same claim, sharper wording? Fine — leave the comments.\n` +
            `  - Different claim? The comment is stranded. There is no remap\n` +
            `    that fixes it (the anchor did not move, the TEXT did), so say\n` +
            `    so in the migration and in the release notes.\n` +
            `Then: pnpm anchors:snapshot\n`,
    ).toEqual([]);
  });

  it("has not deleted an anchor the published document already had", () => {
    const before = snapshot();
    const after = anchorTextMap();

    // A vanished anchor orphans its comments outright: the comment survives in
    // the database and renders nowhere. `article-06-connect-…-empowerment` is
    // the worked example — Article 6's HumaneBench pill was removed in v0.1.0,
    // and Andalib's question about it is still in the database, attached to a
    // pill that no longer exists on the page.
    const removed = Object.keys(before).filter((a) => !(a in after));

    expect(
      removed,
      removed.length === 0
        ? ""
        : `\n\n${removed.length} anchor(s) disappeared:\n${removed
            .map((a) => `  ${a}`)
            .join("\n")}\n\nComments on these render nowhere. Either restore the\n` +
            `anchor, remap them in a migration if there is a genuine successor,\n` +
            `or accept the loss deliberately and write it down.\n` +
            `Then: pnpm anchors:snapshot\n`,
    ).toEqual([]);
  });

  it("covers every anchor kind the homepage emits", () => {
    // If a future refactor teaches HomepageArticles a sixth anchor kind and
    // not anchor-map.ts, the two tests above go blind to it — they can only
    // police what the map knows about. This is the reminder to keep them in
    // step, and it is exactly how pull quotes and titles were missed the first
    // time round.
    const kinds = new Set(
      Object.keys(anchorTextMap()).map((a) =>
        a.includes("-connect-")
          ? "pill"
          : a.replace(/^article-\d+-/, "").replace(/^s-\d+$/, "s-N"),
      ),
    );
    expect([...kinds].sort()).toEqual([
      "connects-label",
      "pill",
      "pullquote",
      "s-N",
      "title",
    ]);
  });

  it("numbers sentences the way the page does, not the way the markdown does", () => {
    // Migration 0010 remapped `article-07-s-5` -> `article-07-s-6`, reasoning
    // that v0.1.0 inserted the COPPA definition mid-article and pushed
    // "Children's data is not a training asset." down a slot. That is true of
    // the canonical markdown, which counts the pull quote as a body sentence.
    // It is false of the page, twice over:
    //
    //   1. The closing line is the PULL QUOTE (`article-07-pullquote`), not a
    //      body sentence — so no v0.0.1 comment could ever sit on s-5, and the
    //      remap matched zero rows in production.
    //   2. COPPA was APPENDED after s-4, not inserted before anything, so no
    //      anchor shifted at all. And s-6 does not exist: the body has five
    //      sentences. Had that CASE ever matched, it would have moved a
    //      comment to an anchor that renders nowhere.
    //
    // Pinned here because the misreading survived three rounds of review.
    const map = anchorTextMap();
    expect(map["article-07-pullquote"]).toBe(
      "Children's data is not a training asset.",
    );
    expect(map["article-07-s-5"]).toMatch(/^For the purposes of this article/);
    expect(map["article-07-s-6"]).toBeUndefined();
  });
});
