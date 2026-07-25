import type { ThreadedComment } from "@/lib/db/queries";

/**
 * Total number of comments in a threaded tree, replies included.
 *
 * Used to put a live count on the Proposed tab and in the feedback invite,
 * so a first-time visitor can see the draft is an active conversation rather
 * than a finished document.
 */
export function countComments(nodes: ThreadedComment[]): number {
  let total = 0;
  for (const node of nodes) {
    total += 1 + countComments(node.replies);
  }
  return total;
}

/** "1 comment" / "12 comments" — small helper so callers don't re-derive it. */
export function commentCountLabel(count: number): string {
  return `${count} ${count === 1 ? "comment" : "comments"}`;
}
