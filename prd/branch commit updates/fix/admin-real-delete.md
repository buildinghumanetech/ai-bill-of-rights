# Branch Progress: fix/admin-real-delete

## Progress Update as of 2026-09-24 10:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Urgent fix, separate from the returning-signers work. The admin "Delete" button on /admin/signers had been anonymizing instead of deleting since commit `27a3540` ("Improve sign-up PII handling", PR #29, May 29). It now has two separate buttons: **Delete** removes the signer permanently through the same `deleteSigner` cascade as "Delete my account", and **Anonymize** keeps the old behavior with its own label. Both are admin-only. No migrations.

### Detail of changes made:
- **Root cause:** `27a3540` switched `deleteSignerAction` (`src/server/actions/admin.ts`) from `deleteSigner` to `anonymizeSigner`. The stated reasons were that the old hard delete missed selfies and the comment tables, so it failed with FK errors (500) for any active signer, and consistency with the revoke flow. `7683783` then changed the button's confirm text to the anonymize wording but left the label as "Delete". #94 only added a Referrals nav link to that page. The FK problem was later fixed in `deleteSigner` itself (`25a9411`, which cascades every signer FK), and #94 uses that for "Delete my account". So hard delete is safe again.
- `src/server/actions/admin.ts`: `deleteSignerAction` calls `deleteSigner(db, signerId)`. It refuses the admin's own row: deleting yourself would drop your admin rights mid-session, and there's no in-app way to restore them. New `anonymizeSignerAction` runs `anonymizeSigner`. Both call `requireAdmin()` and the shared `revalidateSignerPages()`.
- `src/app/admin/signers/AdminRowActions.tsx`: Edit, Make/Revoke admin, **Anonymize** (grey) and **Delete** (red). Delete's confirm reads "Permanently delete <name>? This removes the signer, their signature and everything they posted. The public count goes down by one. This cannot be undone." Anonymize keeps its existing confirm text.
- Tests:
  - New `tests/server/admin.signer-removal.test.ts` (pglite): Delete removes the row and the signature, and the count drops. It refuses the admin's own row. Both actions are admin-only. Anonymize keeps the signature and the count.
  - New `tests/app/admin-row-actions.test.tsx`: each button's confirm names the signer, and each button calls its own action. A cancelled confirm does nothing.
  - `signer-deletion.activity` / `.referrals`: the admin-path cases now cover both buttons.
- 1,134 tests pass; `tsc` is clean; ESLint is clean on the changed files.

### Potential concerns to address:
- Like "Delete my account", admin Delete does not delete the person's Clerk user. If they sign in again they'll be an account with no signer row.
- Deleting is irreversible, and production has no soft-delete. Back up first if in doubt.
- Once this is live, the user plans to delete test signers #91 and #92 by hand.

---
