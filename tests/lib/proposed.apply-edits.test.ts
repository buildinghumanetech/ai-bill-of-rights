import { describe, expect, it } from "vitest";
import { applyEdits } from "@/lib/proposed/apply-edits";
import type { ProposalRow } from "@/lib/db/queries";

function makeProposal(
  overrides: Partial<ProposalRow> & Pick<ProposalRow, "kind" | "targetAnchorId">,
): ProposalRow {
  const defaults: ProposalRow = {
    id: "00000000-0000-0000-0000-000000000001",
    kind: "replace",
    targetAnchorId: "article-01-s-1",
    newText: null,
    rationale: null,
    status: "accepted",
    proposerSignerId: "signer-1",
    displayName: "Alice",
    upvoteCount: 0,
    createdAt: new Date("2026-05-01"),
    decidedAt: new Date("2026-05-02"),
  };
  return { ...defaults, ...overrides };
}

describe("applyEdits", () => {
  it("returns empty map for empty input", () => {
    expect(applyEdits([])).toEqual({});
  });

  it("maps accepted replace to replaceWith", () => {
    const edit = makeProposal({
      kind: "replace",
      targetAnchorId: "article-01-s-1",
      newText: "Better wording.",
    });
    const result = applyEdits([edit]);
    expect(result["article-01-s-1"]).toMatchObject({ replaceWith: "Better wording." });
  });

  it("maps accepted insert_after to insertsAfter entry", () => {
    const edit = makeProposal({
      id: "abcdef01-0000-0000-0000-000000000001",
      kind: "insert_after",
      targetAnchorId: "article-01-s-1",
      newText: "New sentence inserted.",
    });
    const result = applyEdits([edit]);
    expect(result["article-01-s-1"]?.insertsAfter).toHaveLength(1);
    expect(result["article-01-s-1"]?.insertsAfter?.[0].text).toBe(
      "New sentence inserted.",
    );
    expect(result["article-01-s-1"]?.insertsAfter?.[0].id).toBe(
      "article-01-s-1-ins-abcdef01",
    );
  });

  it("maps accepted delete to isDeleted: true", () => {
    const edit = makeProposal({
      kind: "delete",
      targetAnchorId: "article-01-s-2",
      newText: null,
    });
    const result = applyEdits([edit]);
    expect(result["article-01-s-2"]).toMatchObject({ isDeleted: true });
  });

  it("composes replace + insert_after + delete across different anchors", () => {
    const edits: ProposalRow[] = [
      makeProposal({
        id: "aaaaaaaa-0000-0000-0000-000000000001",
        kind: "replace",
        targetAnchorId: "article-01-s-1",
        newText: "Replaced.",
      }),
      makeProposal({
        id: "bbbbbbbb-0000-0000-0000-000000000001",
        kind: "insert_after",
        targetAnchorId: "article-01-s-2",
        newText: "Inserted.",
      }),
      makeProposal({
        id: "cccccccc-0000-0000-0000-000000000001",
        kind: "delete",
        targetAnchorId: "article-02-s-1",
        newText: null,
      }),
    ];
    const result = applyEdits(edits);
    expect(result["article-01-s-1"]?.replaceWith).toBe("Replaced.");
    expect(result["article-01-s-2"]?.insertsAfter?.[0].text).toBe("Inserted.");
    expect(result["article-02-s-1"]?.isDeleted).toBe(true);
  });

  it("ignores non-accepted proposals", () => {
    const edits: ProposalRow[] = [
      makeProposal({
        kind: "replace",
        targetAnchorId: "article-01-s-1",
        newText: "Should not appear.",
        status: "pending",
      }),
      makeProposal({
        kind: "delete",
        targetAnchorId: "article-01-s-2",
        status: "rejected",
      }),
    ];
    const result = applyEdits(edits);
    expect(Object.keys(result)).toHaveLength(0);
  });
});
