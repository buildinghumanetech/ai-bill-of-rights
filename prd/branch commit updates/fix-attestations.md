# Branch Progress: fix-attestations

## Progress Update as of 2026-05-25 13:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Restructured the admin attestation-review email to clearly separate investigation links from the approve action. Also overhauled the admin attestations dashboard to show all attestations (pending, approved, hidden) with a reusable `AttestationRow` component and a new `DeleteAttestationButton`. Backing query `listAllAttestationsForAdmin` was added to support the full-status view.

### Detail of changes made:
- **`src/lib/email/templates.ts`** — `attestationVerifyEmail` now returns `{ subject, text, html }`. The email is structured in two explicit steps: "Step 1 — Investigate First" (neutral grey buttons to the admin dashboard and the product URL) and "Step 2 — Approve Only When Ready" (yellow warning background, bold "first click immediately publishes" text, green Approve & Publish button). Plain-text version uses ASCII dividers and `⚠` markers for the same separation. Added `productUrl` and `adminDashboardUrl` optional opts.
- **`src/server/actions/attestations.ts`** — `submitAttestationAction` now passes `productUrl` and `adminDashboardUrl: ${siteUrl}/admin/attestations` to `attestationVerifyEmail`, so the email carries both investigation links.
- **`src/lib/db/queries.ts`** — Added `AdminAttestationListItem` interface and `listAllAttestationsForAdmin` query that returns all attestations with a derived `status` field (`"pending" | "approved" | "hidden"`) computed from `hiddenAt`, `published`, and `manuallyApproved`.
- **`src/app/admin/attestations/page.tsx`** — Switched from `listPendingReviewAttestations` to `listAllAttestationsForAdmin`. Added `STATUS_CONFIG` map and `AttestationRow` component (handles all three statuses with color-coded borders/badges). Page now renders three sections: Pending Review, Approved, Hidden. Added `DeleteAttestationButton` import.
- **`src/app/admin/attestations/DeleteAttestationButton.tsx`** — New client component for the permanent-delete button with confirmation dialog.
- **`src/server/actions/admin.ts`** — Added `deleteAttestationAction` server action that deletes an attestation by ID and revalidates both `/admin/attestations` and `/attestations`.

### Potential concerns to address:
- The `allowBuilds` stanza pnpm auto-inserted into `pnpm-workspace.yaml` with placeholder `"set this to true or false"` text was reverted before this commit — if pnpm re-inserts it during `pnpm install`, it should be set to real booleans (`@clerk/shared: true`, `esbuild: true`) rather than committed with placeholder text.
- `listAllAttestationsForAdmin` uses `any` typing for the db client for pglite/test compatibility; this is consistent with other queries in the file.

---
