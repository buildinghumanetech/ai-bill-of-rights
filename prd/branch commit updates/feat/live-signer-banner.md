# Branch Progress: feat/live-signer-banner

## Progress Update as of 2026-05-19 14:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Brainstormed a "live signer banner" feature with the project owner via the superpowers brainstorming skill (using the new visual companion to compare three banner-placement options). Captured the agreed design at `docs/superpowers/specs/2026-05-19-live-signer-banner-design.md`. Branch is off `main`; no application code touched in this commit. Next step is the implementation plan via the writing-plans skill, after the owner reviews the committed spec.

### Detail of changes made:
- **Design spec at `docs/superpowers/specs/2026-05-19-live-signer-banner-design.md`** (~300 lines). Sections 1–12 cover goal, scope (in + out), decisions log (8 rows captured from the brainstorming dialogue), architecture diagram, API contract, client architecture (provider + banner + count component), cold-start behavior, banner UX details, privacy posture, error handling, testing, and deferred items.
- **All eight architectural decisions made during brainstorming are captured in Section 3 (Decisions log)** so a future implementer doesn't need to re-derive them. Key calls:
  - Placement: floating pill near top, matching the existing "Join X others" glass-pill design language (user chose option B from the visual mockup comparison).
  - Realtime: polling every 60s (user's call — chose simplicity over instant push; trivially upgradable to SSE later if sign rate climbs).
  - Cold-start: replay the most recent signer iff signed within the past 60 minutes; otherwise no replay. Older signers in the cold-start window are folded silently into `count`.
  - Count display: a single `<SignatureCount />` client component replaces the three `{signatureCount.toLocaleString()}` usages across `page.tsx` and `FloatingSignButton.tsx`, reading from the same provider that drives the banner.
- **Accessibility:** spec mandates `aria-live="polite"` + `role="status"` on the banner container, and `prefers-reduced-motion: reduce` honored in the keyframe definitions. Folded into the banner UX section as a requirement (not a nice-to-have).
- **API contract is intentionally tiny:** one route, `GET /api/signers/recent?since=<iso?>`, returns `{ count, newSigners[] }`. Soft-banned signers excluded from `newSigners` but still counted in `count` (banner is more prominent than the static `/signers` list, so safer-than-the-list posture).
- **Privacy posture is explicit (Section 9):** banner exposes exactly the fields already publicly visible on `/signers` and `/signatories/[id]`. No new exposure.

### Potential concerns to address:
- **Branch conflict risk with PR #12 (`hotfix/mobile-hero-overflow`):** that PR modifies `FloatingSignButton.tsx` and `page.tsx`, both of which this feature also needs to edit (to swap the count for `<SignatureCount />`). Plan: wait for #12 to merge before implementing, or rebase `feat/live-signer-banner` onto `hotfix/mobile-hero-overflow` if we need to move in parallel. The spec is just markdown so no conflict at this stage.
- **Spec hasn't been reviewed by the owner yet.** Per the brainstorming flow, the owner reviews the committed spec before the implementation plan is written. If the owner wants any changes — banner content, animation timing, cold-start threshold, etc. — they edit before the plan is generated. Implementation has not started.
- **No SSE / live-push fallback path implemented or planned.** Section 12 lists it as deferred. Acceptable for current sign rate (~days between signs); decision should be revisited if the sign rate climbs above ~1/min.

---
