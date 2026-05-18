# Branch Progress: feat/phase-3-comments-upvotes-moderation

## Progress Update as of 2026-05-18 17:00 Pacific (Plan 3 spec written)
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Branched off `feat/phase-2-as-code-attestations` at SHA `a13b41b`. Wrote Phase 3 implementation plan at `docs/superpowers/plans/2026-05-18-phase-3-comments-upvotes-moderation.md`. 13 TDD tasks: three new tables (`comments`, `comment_upvotes`, `reports`) with indexes, DB-backed rate-limit enforcement, four server-action surfaces (comment CRUD, upvote toggle, report with auto-soft-hide at 5 reports, admin resolve), four new components (recursive `CommentThread`, client `CommentComposer`/`UpvoteButton`/`ReportModal`), the client-side hover-to-comment drawer wired into `/v/[version]`, and three admin pages (`/admin/reports`, `/admin/signers`, `/admin/comments`).

### Detail of changes made:
- Plan covers Section 8 of the design spec + the admin routes from Section 4.2.
- Comments scoped to `(version_id, anchor_id)`; arbitrary nesting via `parent_comment_id`; visual depth-collapse at 4 (desktop) handled by `<details>` accordion past depth-4. Mobile cap at 2 deferred to a CSS polish pass.
- Rate limiting is a single pure function `enforceRateLimit(db, opts)` that counts rows in a sliding window — simpler than Redis, good enough for MVP, easy to swap later. 5 comments/min and 50/day for comments are applied at submit time.
- Reports trigger an auto-soft-hide at 5 unresolved reports per comment (configurable constant). Moderator manual hide flips `hidden_at` directly.
- The drawer is one client component (`CommentDrawer`) listening to a `window.dispatchEvent("anchor-open", { anchorId })` custom event emitted by each `<AnchorSentence>` wrapper. Keeps the document body server-rendered while still feeling interactive.
- Admin pages reuse the `signers.is_admin` gate established in Plan 2's `/admin/attestations`. Each admin server action re-checks `is_admin` server-side (defense-in-depth — middleware ensures auth, action ensures role).
- Branches off Phase 2; will need rebase onto main once Phases 1+2 are merged.

### Potential concerns to address:
- `softBannedAt` column is set by `/admin/signers` but **not enforced** in `submitCommentAction`/`submitUpvoteAction`/`submitReportAction`. Soft-banned signers can still post. Tracked as known follow-up; trivial fix (add `isNull(signers.softBannedAt)` to the signer lookup) but worth being explicit about pre-launch.
- `listCommentsForAnchor` is called once per anchor in the version page handler (N+1 in number of anchors-with-comments). Acceptable until pages with hundreds of discussed sentences appear; replace with a single `WHERE anchor_id IN (...)` query then.
- The drawer ships ALL comments for the version in the initial client payload. At thousands of comments this becomes bloat; defer to incremental fetch in a follow-up.
- Plan creates an unused `AnchorMarker.tsx` (referenced in file structure + as Step 1 of Task 9) that's superseded by `AnchorSentence.tsx`. Implementers should skip the `AnchorMarker.tsx` creation step or delete the file after creating it. (Spec bug; non-blocking.)

---
