// src/lib/comments/draft.ts
//
// Persist a user's unsubmitted Comment / Suggest-Changes draft across the
// Clerk OTP redirect so anonymous → authenticated flows don't lose typing.
// The shape is intentionally permissive so the same helper handles both
// comments and proposed edits in phase 3.

const KEY = "abor-draft-v1";

export interface DraftPayload {
  kind: "comment" | "proposal";
  baseVersionId: string;
  anchorId?: string;
  proposalId?: string;
  parentCommentId?: string;
  // Proposal-specific fields. Ignored for comments.
  proposalKind?: "replace" | "insert_after" | "delete";
  rationale?: string;
  // Common.
  body: string;
  // Where to scroll back to on return.
  returnTo: string;
  ts: number;
}

export function saveDraft(d: DraftPayload): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...d, ts: Date.now() }));
  } catch {
    /* private mode */
  }
}

export function loadDraft(): DraftPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftPayload;
    // Expire stale drafts > 30 min old.
    if (Date.now() - parsed.ts > 30 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* */
  }
}
