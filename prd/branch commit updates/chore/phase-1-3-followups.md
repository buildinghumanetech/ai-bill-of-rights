# Branch Progress: chore/phase-1-3-followups

## Progress Update as of 2026-05-18 19:00 Pacific (softBan enforcement)
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Branched off `feat/phase-3-comments-upvotes-moderation`. Closes the gap flagged in Plan 3's self-review: the `signers.softBannedAt` column is set by the admin /signers page but was not enforced in any of the three signer-gated server actions (`submitCommentAction`, `submitUpvoteAction`, `submitReportAction`). Soft-banned signers could still post, upvote, and report. This commit enforces the check at the policy boundary.

### Detail of changes made:
- `src/server/actions/comments.ts::submitCommentAction`: signer lookup now selects `softBannedAt` and throws "This account is suspended pending moderator review." if non-null.
- `src/server/actions/upvotes.ts::submitUpvoteAction`: same treatment.
- `src/server/actions/reports.ts::submitReportAction`: same treatment.
- `tests/server/comments.test.ts`: appended a documentation test confirming `createComment` (data layer) is the right place for the test, with `submitCommentAction` (policy layer) as the gating point. The two-layer separation is intentional.

### Potential concerns to address:
- The check is repeated in three places (DRY violation). For three small functions this is acceptable; if we add more signer-gated actions, factor out `assertSignerActive(db, userId)`.
- Soft-banned signers' EXISTING comments / upvotes / reports remain on the site. Bans are forward-only. Acceptable; admins can hide individual comments via `/admin/comments` if needed.

---
