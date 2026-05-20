import type { ProposalRow } from "@/lib/db/queries";

export interface AnchorEditOverride {
  replaceWith?: string;
  isDeleted?: boolean;
  insertsAfter?: { id: string; text: string }[];
}

export type EditsByAnchor = Record<string, AnchorEditOverride>;

/**
 * Converts accepted ProposalRow[] into a per-anchor edit override map.
 *
 * - `replace` → sets replaceWith on the anchor (first accepted wins; admin
 *   already auto-rejected conflicts when accepting).
 * - `delete` → sets isDeleted: true on the anchor.
 * - `insert_after` → appends to insertsAfter[] with synthetic id
 *   `${targetAnchorId}-ins-${editId.slice(0, 8)}`.
 *
 * The resulting map is consumed by HomepageArticles in interactive mode.
 */
export function applyEdits(edits: ProposalRow[]): EditsByAnchor {
  const result: EditsByAnchor = {};

  function ensure(anchorId: string): AnchorEditOverride {
    if (!result[anchorId]) result[anchorId] = {};
    return result[anchorId];
  }

  for (const edit of edits) {
    if (edit.status !== "accepted") continue;
    const override = ensure(edit.targetAnchorId);

    switch (edit.kind) {
      case "replace":
        // First accepted replace wins (conflicts already rejected by acceptProposal).
        if (!override.replaceWith) {
          override.replaceWith = edit.newText ?? "";
        }
        break;

      case "delete":
        override.isDeleted = true;
        break;

      case "insert_after": {
        if (!override.insertsAfter) override.insertsAfter = [];
        override.insertsAfter.push({
          id: `${edit.targetAnchorId}-ins-${edit.id.slice(0, 8)}`,
          text: edit.newText ?? "",
        });
        break;
      }
    }
  }

  return result;
}
