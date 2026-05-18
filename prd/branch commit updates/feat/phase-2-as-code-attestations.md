# Branch Progress: feat/phase-2-as-code-attestations

## Progress Update as of 2026-05-18 15:45 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Branched off `feat/phase-1-signable-mvp` at SHA `fb74a69`. Wrote Phase 2 implementation plan at `docs/superpowers/plans/2026-05-18-phase-2-as-code-attestations.md`. 11 TDD tasks covering: attestations table + migration, frontier-lab allowlist, server actions (create / verify / approve / hide), email-confirmation flow, raw-file routes for `/v/[version]/agents.md` and `/v/[version]/spec.json`, the `/v/[version]/as-code` page with tool tabs + downloads + attestation form, public `/attestations` page, verify landing page, and admin review queue at `/admin/attestations` (Clerk + `signers.is_admin` gated).

### Detail of changes made:
- Plan saved; covers Section 9 of the design spec end-to-end.
- Architecture: opaque UUID verification token stored on `attestations.verification_token`, no JWT signing. Simpler and good enough for email-link verification.
- Frontier-lab gate uses a word-boundary regex against an allowlist of known names. Erring toward false-positives (e.g., "We use OpenAI's API" gates for review) — admin override is the safety valve, and the cost of a false negative is far higher than the cost of a delay.
- Raw markdown/JSON files are streamed from disk (`content/bill-of-rights/v{X.Y.Z}.agents.md|.spec.json`), with a `^\d+\.\d+\.\d+$` regex guard against path traversal. The cached `versions` row stores parsed JSON for the document, not the raw agents.md/spec.json, so disk is the source.
- Admin actions are `"use server"` functions defined inside the page file with explicit `is_admin` checks. Could be hoisted into `src/server/actions/admin.ts` if we add more admin surface later.
- Branches off Phase 1, so depends on its merge. PR will note the stacking.

### Potential concerns to address:
- `hideAttestation` accepts a `reason` parameter but doesn't persist it. Acceptable for MVP — git log of the admin action via Vercel logs is the audit trail. Add `attestation_hide_log` table if a real paper trail is required.
- The admin role assignment has no UI in this plan — `signers.is_admin` must be flipped via direct SQL or psql/Neon console for now. Acceptable since the only admin in MVP is Erika herself.
- The "review queue" doesn't paginate. Acceptable until we have hundreds of pending flagged attestations.
- No rate limiting on attestation submissions. A single hostile actor could spam attestations for every version. Mitigation: the verify-email gate requires real email accounts.

---
