# Branch Progress: main

## Progress Update as of 2026-05-18 12:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
First entry. A brainstorming session produced a complete pre-implementation design spec for the AI Bill of Rights website at `docs/superpowers/specs/2026-05-18-ai-bill-of-rights-design.md`. The Next.js 16 scaffolding (already on `main`) is intact and unchanged. This commit adds the design spec, sets up the progress-logging workflow (this file, the convention in `CLAUDE.md`, and a pre-commit hook reminder), and otherwise touches no application code.

### Detail of changes made:
- **Design spec** at `docs/superpowers/specs/2026-05-18-ai-bill-of-rights-design.md` (~600 lines). Covers: stack (Next.js 16 / Clerk / Neon + Drizzle / Resend / Tailwind 4, mirroring `visionpipe-web` for handoff), full route map, Drizzle data model (7 tables: versions, signers, signatures, consent_records, comments, comment_upvotes, reports, attestations), the consent-screen design (Section 6, the highest-stakes surface — must hold up to Article 1 of the document itself), markdown-as-source-of-truth with build-time sync to Postgres, threaded comments with arbitrary nesting and depth-aware UI collapse, the "Implement as Code" artifact (`agents.md` + `spec.json` per version, plus public attestations registry).
- **MVP scope decided**: Phase 1 (sign-as-is) + Phase 2 (comments + upvotes). Phase 3 forks (suggestion-mode inline edits, named variants, editorial promotion) deferred but designed-for in the data model — additive, not a refactor.
- **All 13 framing decisions are captured in Section 3 (Decisions log)** so the implementer doesn't need to re-derive them. Examples: comments scoped to a single version (not migrated forward); revocation anonymizes the signature ("Anonymized signer #N") rather than deleting it; verified signers only can comment or report; no Clerk gate on builder attestations but allowlist-gated manual review for frontier-lab claims.
- **Sentence anchoring approach**: explicit `{#article-N-s-M}` IDs in the markdown source (Pandoc-style), parsed into `versions.parsed_json` at sync time, used to wrap sentences in `<span data-anchor-id="...">` at render time so the comment drawer knows what to anchor to.
- **Privacy posture**: Article 1 of the document forbids opt-out consent / buried checkboxes / behavioral data use without explicit consent. The site captures a comprehensive fingerprint per the owner's call, but only behind a field-by-field consent screen with active-click checkbox, with revocation always one click away from any signer's public page. The consent text is itself versioned and its hash stored per signature so we can prove what each signer actually saw.
- **Progress-logging workflow set up**:
  - `prd/branch commit updates/<branch>.md` per-branch logs, newest-on-top, with the format the user specified.
  - `CLAUDE.md` updated to instruct future Claude sessions to update this log on every commit.
  - `.git/hooks/pre-commit` warns (does not block) if the branch progress log isn't staged.
- **No application code touched in this commit.** The scaffolded `src/app/` (a default Next.js 16 starter from a separate agent) is unchanged. The next commit will start implementing against the spec.

### Potential concerns to address:
- **Editorial council unidentified.** Section 12.3 risk #2: the "living document" claim is hollow unless `/about` names a named, accountable body (even if it's just Erika at launch, the page must state that explicitly). Pre-launch blocker.
- **Consent screen copy needs a legal-conscious pass.** Section 6.3 has a complete draft, but Erika should review the exact wording before launch. If the press reads it side-by-side with Article 1 of the document we're hosting, it has to hold up.
- **Domain name (`aibillofrights.org`) is a working assumption only.** Section 12.2 lists it as deferred. Needs to be confirmed + registered before Resend DNS, Clerk redirect URLs, and OG tags are finalized.
- **Next.js 16 is new** (AGENTS.md in the repo warns coding agents that APIs and conventions differ from training data). Implementers must consult `node_modules/next/dist/docs/` before relying on muscle memory for middleware, server actions, or route handlers. This could slow the first implementation pass.
- **No bot detection beyond Clerk + rate limits in MVP** (Section 12.1). If launch goes viral and bot signatures appear, we may need to add Turnstile / hCaptcha as an emergency Phase 1.5 task.
- **`is_current` partial-unique-index constraint** in `versions` table (Section 5.1) is conceptually correct but the exact Drizzle expression may need a raw-SQL custom expression. Worth flagging when the migration is written.
- **Resend digest emails** for comment replies (Section 8.5) need a daily cron — Vercel has a `vercel.json` cron config but the function timing semantics need a quick spike before relying on it for delivery.

---
