import { describe, expect, it } from "vitest";
import { commentCountLabel, countComments } from "@/lib/comments/count";
import type { ThreadedComment } from "@/lib/db/queries";

/** Minimal ThreadedComment stand-in — countComments only reads `replies`. */
function node(replies: ThreadedComment[] = []): ThreadedComment {
  return { replies } as unknown as ThreadedComment;
}

describe("countComments", () => {
  it("is 0 for an empty tree", () => {
    expect(countComments([])).toBe(0);
  });

  it("counts top-level comments", () => {
    expect(countComments([node(), node(), node()])).toBe(3);
  });

  it("counts replies, not just roots", () => {
    expect(countComments([node([node(), node()])])).toBe(3);
  });

  it("counts arbitrarily deep nesting", () => {
    const deep = node([node([node([node()])])]);
    expect(countComments([deep])).toBe(4);
  });

  it("counts across several roots with mixed depth", () => {
    const tree = [node([node()]), node(), node([node([node(), node()])])];
    // 2 + 1 + 4
    expect(countComments(tree)).toBe(7);
  });
});

describe("commentCountLabel", () => {
  it("singularizes 1", () => {
    expect(commentCountLabel(1)).toBe("1 comment");
  });

  it("pluralizes 0 and n>1", () => {
    expect(commentCountLabel(0)).toBe("0 comments");
    expect(commentCountLabel(12)).toBe("12 comments");
  });
});
