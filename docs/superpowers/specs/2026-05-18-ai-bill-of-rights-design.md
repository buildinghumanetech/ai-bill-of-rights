# AI Bill of Rights — Design Spec

**Date:** 2026-05-18
**Status:** Approved (pre-implementation)
**Author:** Drafted with Claude via the superpowers brainstorming skill, in dialogue with the project owner
**Source document:** `An AI Bill of Rights — A People's Demand for Human-Centered AI` (Erika Anderson, Building Humane Technology / HumaneBench.ai) — at the time of writing, lives as a Google Doc and signatures are collected as Doc comments.
**Repo:** https://github.com/buildinghumanetech/ai-bill-of-rights

---

## 1. Goal

Build a public website that turns the AI Bill of Rights from a Google Doc into a versioned, signable, open-source living document. Non-technical humans can sign it, comment on it, propose edits, and (eventually) endorse user-proposed variants. AI builders can pull a parallel "implement-as-code" artifact and publicly attest that their products adhere to a specific version.

The site has to live up to the document's own demands — particularly Article 1 ("Your Data Belongs to You"). If the site collects signer data in a way Article 1 forbids AI companies from collecting user data, the project loses credibility on day one.

## 2. Scope

This spec covers the MVP launch: **Phase 1 + Phase 2** combined.

- **Phase 1 — Sign**: read the document, authenticate via email or SMS OTP, complete a consent screen, sign a specific version; public signer list with verification badges and self-reported location/affiliation.
- **Phase 2 — Comment + Upvote**: any verified signer can attach threaded comments to any sentence in any version; upvotes; report-and-moderate workflow.
- **Phase 3 — Forks (suggestion-mode edits, named variants, variant endorsements, editorial promotion)**: **out of scope for MVP**, but the data model and URL structure are designed so Phase 3 is additive, not a refactor.

The "Implement as Code" artifact (markdown agent-instructions + machine-readable JSON spec + builder attestations) ships in MVP because attestations must be version-aware from day one — retrofitting that into v2 is painful.

## 3. Decisions log

These are the framing decisions made during brainstorming, captured so the implementer doesn't need to re-derive them:

| # | Decision | Rationale |
|---|---|---|
| 1 | Signer data: comprehensive fingerprint behind explicit consent screen | Owner's call. Spec compensates with a high-rigor consent screen (Section 6). |
| 2 | Auth + DB stack: **Clerk + Neon Postgres + Drizzle + Resend** | Mirrors `visionpipe-web` for handoff continuity to Erika. |
| 3 | Edit-and-sign mechanic: inline annotations + lightweight forks (chosen over RFC-style amendments) | Lower friction; non-technical-friendly; "messy humanity" feel. Phase 3 only. |
| 4 | MVP cut: Phase 1 + Phase 2 (forks deferred) | Owner's call. |
| 5 | Public signer display: name + affiliation + location + verification badge | All four selected by owner. |
| 6 | Moderation: post-moderation + report button | Trusts the OTP gate to deter most abuse; fast to ship. |
| 7 | Document storage: markdown in repo (source of truth) + Postgres cache | Honors open-source promise; cache speeds reads + comment anchoring. |
| 8 | Comments are scoped to a single version; nested arbitrarily deep but UI collapses past depth 4 (desktop) / depth 2 (mobile) | Honest semantics; legible UI. |
| 9 | Only verified signers can comment or report | Quality + accountability over volume. |
| 10 | Revocation anonymizes signature ("Anonymized signer #N"); does not delete it | Signature is a public act; the *data* about the signer is the part Article 1 says is theirs. |
| 11 | New versions published via GitHub PRs against `content/bill-of-rights/` | Open audit trail; non-technical contributors can use GitHub's web UI. No admin publishing UI in MVP. |
| 12 | "Implement as Code" artifact: two files per version (`agents.md`, `spec.json`) + public attestations registry | Direct realization of source doc's "human version / machine version" framing. |
| 13 | Builder attestations: no Clerk gate; email-confirmation only; manual review for high-profile org-name claims | Friction reduction matters more than marginal trust gain. |

## 4. Architecture

### 4.1 Stack

- **Next.js 16.2.6** (App Router, `src/app/`) — already scaffolded
- **React 19.2.4** — already scaffolded
- **TypeScript 5** — already scaffolded
- **Tailwind CSS v4** (PostCSS plugin form) — already scaffolded
- **pnpm** workspace — already scaffolded
- **Clerk** (`@clerk/nextjs`) — email + SMS OTP
- **Neon Postgres** (serverless) via `@neondatabase/serverless`
- **Drizzle ORM** + `drizzle-kit` for migrations
- **Resend** for transactional email
- **`ua-parser-js`** for browser/OS extraction
- **`remark` + `remark-gfm` + custom anchor plugin** for markdown parsing
- **Vercel** for hosting (deployed under Erika's account; project already linked via `.vercel/`)

> **Note on Next.js 16:** The scaffolding includes an `AGENTS.md` warning that Next.js 16 has breaking changes vs. earlier versions. Any agent or human implementer must consult `node_modules/next/dist/docs/` before writing code that relies on conventions like middleware, server actions, or route handlers — the surface has shifted.

### 4.2 Route map

| Route | Purpose | Phase |
|---|---|---|
| `/` | Hero, what-and-why summary, live signature count, primary CTA "Read & sign →", secondary CTA "Building AI? Implement this in your code →" | 1 |
| `/bill-of-rights` | Server redirect (302) to `/v/<current>` | 1 |
| `/v/[version]` | The document. Version banner, prose with anchored sentences, sign CTA, "Implement as Code" CTA, comment markers | 1 (prose + sign), 2 (comments) |
| `/v/[version]/as-code` | View/copy/download `agents.md` + `spec.json` per tool tab; `curl` one-liner; "Self-attest" form | 1 |
| `/v/[version]/diff/[from]` | Server-rendered diff between two versions | 2 (deferred-ok) |
| `/signatories` | Paginated list of signers; filter by version / by country | 1 |
| `/signatories/[id]` | One signer's public page | 1 |
| `/attestations` | Public list of products + orgs attesting to a version | 1 |
| `/about` | Stub | 1 (stub) |
| `/why` | Stub | 1 (stub) |
| `/sign/profile` | Post-OTP profile form (display name, location, affiliation) | 1 |
| `/sign/consent` | The consent screen (Section 6) | 1 |
| `/sign/complete` | Confirmation + share buttons | 1 |
| `/account` | Logged-in signer dashboard: signatures, comments, edit display fields | 1 |
| `/account/revoke` | Revocation flow | 1 |
| `/admin` | Mod dashboard landing | 2 |
| `/admin/reports` | Reports queue | 2 |
| `/admin/signers` | Signer search, role assignment, soft-ban | 2 |
| `/admin/attestations` | Review high-profile attestation claims | 1 |
| `/api/...` | REST endpoints (sign, comment, upvote, report, attest, revoke, etc.) | 1–2 |

### 4.3 System boundaries

- **The repo is the source of truth for the document.** A new version of the Bill of Rights is a PR that adds `v{X.Y.Z}.md` + `v{X.Y.Z}.agents.md` + `v{X.Y.Z}.spec.json` + updates `versions.json`. Merging to `main` triggers a Vercel rebuild which runs a postbuild sync script.
- **The database is the engagement layer.** Signatures, consent records, comments, upvotes, reports, attestations — all DB. The DB never holds the canonical document text; only a hash of the version a signer signed, so we can prove what they signed even if a `versions` row were later modified.
- **Clerk owns identity.** Our `signers` table extends Clerk users with display fields and verification metadata; it doesn't replace Clerk.

## 5. Data model

Drizzle schema, conceptually (final field names + types tuned at implementation time):

### 5.1 Tables

```typescript
// versions — cache of /content/bill-of-rights/*.md
versions {
  id: uuid primary key
  version: text not null              // "1.0.3"
  published_at: timestamp not null
  markdown_hash: text not null        // sha-256 of the .md file at publish time
  agents_md_hash: text not null       // sha-256 of the .agents.md file
  spec_json_hash: text not null       // sha-256 of the .spec.json file
  parsed_json: jsonb not null         // structured representation: articles, paragraphs, sentences, anchors
  is_current: boolean not null default false
  git_commit_sha: text                // optional, for traceability
  // Phase 3 forward-compat:
  is_user_fork: boolean not null default false
  parent_version_id: uuid             // null in MVP (no forks)

  unique (version)
  partial-unique (is_current) where is_current = true
}

// signers — extends Clerk users
signers {
  id: uuid primary key
  clerk_user_id: text not null unique
  display_name: text not null
  affiliation: text                   // nullable
  location_text: text                 // nullable, self-reported, free text
  verification_method: 'email' | 'sms'
  verified_at: timestamp not null
  is_admin: boolean not null default false   // mod role
  soft_banned_at: timestamp           // nullable (Phase 2)
  created_at: timestamp not null default now
}

// signatures — one signer signs one version (or many)
signatures {
  id: uuid primary key
  signer_id: uuid references signers(id)
  version_id: uuid references versions(id)
  signed_at: timestamp not null default now
  version_hash_at_signing: text not null   // copy of versions.markdown_hash at time of signing
  consent_record_id: uuid references consent_records(id)

  unique (signer_id, version_id)
}

// consent_records — audit trail for what was disclosed and captured
consent_records {
  id: uuid primary key
  signer_id: uuid references signers(id)
  consented_at: timestamp not null default now
  consent_text_hash: text not null         // sha-256 of the exact consent language the user saw
  captured_fields: jsonb not null          // the actual fingerprint values (see Section 6.5)
  revoked_at: timestamp                    // nullable — Article 1 demands revocability
}

// comments — Phase 2; arbitrarily nestable via parent_comment_id
comments {
  id: uuid primary key
  version_id: uuid references versions(id)
  anchor_id: text not null                 // matches an id in versions.parsed_json
  signer_id: uuid references signers(id)
  body: text not null
  parent_comment_id: uuid references comments(id)   // nullable; arbitrary nesting depth
  created_at: timestamp not null default now
  hidden_at: timestamp                     // nullable; moderator action
  hidden_reason: text                      // nullable
}

// comment_upvotes — Phase 2
comment_upvotes {
  comment_id: uuid references comments(id)
  signer_id: uuid references signers(id)
  created_at: timestamp not null default now
  primary key (comment_id, signer_id)
}

// reports — Phase 2; moderation queue
reports {
  id: uuid primary key
  comment_id: uuid references comments(id)
  reporter_signer_id: uuid references signers(id)
  reason: text                             // optional free text
  created_at: timestamp not null default now
  resolved_at: timestamp                   // nullable
  resolved_by: uuid references signers(id)
  resolution: 'hidden' | 'allowed'         // nullable until resolved
}

// attestations — builders publicly committing to a version
attestations {
  id: uuid primary key
  org_name: text not null
  product_name: text not null
  product_url: text                        // optional
  version_id: uuid references versions(id)
  contact_email: text not null
  claimed_at: timestamp not null default now
  email_verified_at: timestamp             // nullable — set when confirmation link is clicked
  manually_reviewed_at: timestamp          // nullable — set by admin for high-profile claims
  published: boolean not null default false  // controlled by email_verified_at + (if needed) manually_reviewed_at
  hidden_at: timestamp                     // nullable, mod action for false claims
}
```

### 5.2 Indexes

- `signatures (version_id, signed_at desc)` — for `/v/[version]` signer feed
- `comments (version_id, anchor_id) where hidden_at is null` — for per-anchor comment counts
- `comments (parent_comment_id)` — for thread expansion
- `comment_upvotes (comment_id)` — for upvote counts
- `attestations (version_id) where published = true` — for `/attestations`
- `consent_records (signer_id)` — for `/account` revocation views

### 5.3 Auto-soft-hide rule (Phase 2)

When `reports` for a single comment reach 5 (configurable), that comment is auto-hidden pending moderator review (`hidden_at = now()`, `hidden_reason = 'auto: threshold of reports'`). This prevents brigading-style abuse where bad content stays live during a slow moderation cycle.

## 6. Auth + consent flow

This is the highest-stakes surface in the application: Article 1 of the document we're hosting will be applied against this exact screen. The design must satisfy "explicit, informed, revocable consent."

### 6.1 OTP step (Clerk-driven)

User clicks "Sign this version" on `/v/[version]` → Clerk modal opens → user enters email OR phone → receives OTP → enters code. No password, no social login in MVP. Clerk handles delivery (email via Resend or Clerk's transactional service; SMS via Clerk's built-in SMS provider).

### 6.2 Profile step (`/sign/profile`)

Small form post-OTP. Fields:

- **Display name** (required, free text). Helper: *"The name you want history to remember."*
- **Location** (optional, free text). Helper: *"Examples: 'Seoul', 'rural Ohio', 'Nairobi'. As specific or general as you want."*
- **Affiliation** (optional, free text). Helper: *"Your role, organization, or how you'd describe yourself in this context."*

Helper text at top: *"These three are public. Everything else stays private — we'll show you exactly what on the next screen."*

### 6.3 Consent step (`/sign/consent`) — the critical screen

Plain-language; field-by-field; no buried checkboxes; default-unchecked. Layout:

> **Before you sign**
>
> Signing this document records three things publicly, as you entered them:
> - Display name: *"María García"*
> - Location: *"Madrid, Spain"*
> - Affiliation: *"Universidad Complutense"*
> - And a verification badge: *Verified via email*
>
> Signing also records the following **privately**, attached to your signature so we can prove the signature is real and learn who is participating:
>
> | Field | Value we'll record | Why |
> |---|---|---|
> | IP address | `203.0.113.45` | Rate-limit abuse; geolocate (private) |
> | Approximate location from IP | `Madrid, ES` | Aggregate stats only; never linked to your name publicly |
> | Browser | `Firefox 131 on macOS 15` | Aggregate stats; spam detection |
> | Screen, timezone, language | `1920×1080, Europe/Madrid, es-ES` | Aggregate stats |
> | Referrer | `twitter.com` | How people are finding this |
> | Signing time (UTC) | `2026-05-18T19:42:11Z` | Chronological record |
>
> [ ] I have read the above and consent to this record being created. *(default-unchecked; must be actively clicked)*
>
> You can revoke this consent at any time at [/account/revoke](/account/revoke). Revoking removes all private data above and converts your public signature to "Anonymized signer #N." Your signature itself remains — your data does not.
>
> [Sign as María García]   [Cancel]

### 6.4 Submission

On submit, the server:

1. Reads `Request.headers` for IP, User-Agent, language, referrer.
2. Reads Vercel's edge geolocation headers (`x-vercel-ip-country`, `x-vercel-ip-city`, `x-vercel-ip-country-region`) — no third-party geolocation call required.
3. Parses User-Agent via `ua-parser-js` for browser name/version, OS name/version, device type, screen (browser-reported).
4. Computes `sha-256` of the verbatim consent text the user saw (read from a versioned template file in the repo: `content/consent/v{N}.md`).
5. Inserts `consent_records` (with `captured_fields` jsonb) + `signatures` row in a single transaction.
6. Sends a confirmation email via Resend.
7. Redirects to `/sign/complete`, then `/signatories/[id]`.

### 6.5 `captured_fields` jsonb shape

```json
{
  "ip": "203.0.113.45",
  "ip_geo_city": "Madrid",
  "ip_geo_region": "Madrid",
  "ip_geo_country": "ES",
  "user_agent_raw": "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) ...",
  "browser_name": "Firefox",
  "browser_version": "131",
  "os_name": "macOS",
  "os_version": "15",
  "device_type": "desktop",
  "screen_resolution": "1920x1080",
  "timezone": "Europe/Madrid",
  "language": "es-ES",
  "referrer": "https://twitter.com/...",
  "signing_session_utc": "2026-05-18T19:42:11Z"
}
```

Field set is intentionally extensible via jsonb — browser fingerprinting surface drifts over time; the schema doesn't need migration to evolve.

### 6.6 Revocation (`/account/revoke`)

Logged-in signer sees their consent records. Clicking "Revoke" on any record:

1. Soft-deletes `signers.display_name`, `signers.location_text`, `signers.affiliation` (replaces with `null`).
2. Sets `consent_records.revoked_at = now()`.
3. Replaces `consent_records.captured_fields` with `null`.
4. Keeps the `signatures` row intact; the join now resolves to "Anonymized signer #N" where N is the signer's global sequence number.
5. Sends confirmation email.

Revocation is **irreversible**. The user is told this clearly before the final click.

### 6.7 Versioned consent text

The exact prose of the consent screen lives at `content/consent/v1.md` etc., committed to the repo. When the language ever changes (e.g., add a field), a new version is committed; existing `consent_records` retain `consent_text_hash` of what *they* saw. No retroactive rewriting.

## 7. Document storage and versioning workflow

### 7.1 Repo layout

```
/content/bill-of-rights/
  ├── v1.0.0.md
  ├── v1.0.0.agents.md
  ├── v1.0.0.spec.json
  ├── v1.0.1.md
  ├── v1.0.1.agents.md
  ├── v1.0.1.spec.json
  ├── ...
  └── versions.json
/content/consent/
  ├── v1.md
  └── ...
```

### 7.2 `versions.json` structure

```json
{
  "current": "1.0.3",
  "history": [
    {
      "version": "1.0.3",
      "published_at": "2026-08-14",
      "release_notes_pr": 42,
      "changelog": "Article 4 wording updated per amendment #18"
    },
    {
      "version": "1.0.2",
      "published_at": "2026-07-01",
      "release_notes_pr": 31,
      "changelog": "..."
    }
  ]
}
```

### 7.3 Markdown source format

Each version file starts with YAML frontmatter:

```yaml
---
version: 1.0.2
published_at: 2026-08-14
published_by: editorial-council
changelog: |
  - Article 4: replaced "manipulated against your interests" with
    "manipulated against your wellbeing" per amendment #18
release_notes_url: https://github.com/buildinghumanetech/ai-bill-of-rights/pull/42
---
```

Body uses inline anchor IDs (Pandoc-style):

```markdown
## Article 1: Your Data Belongs to You {#article-1}

No AI company may use your conversations, your images, or your behavioral
data to train their models without your explicit, informed, revocable
consent. {#article-1-s-1} Opt-out is not consent. {#article-1-s-2} Buried
checkboxes are not consent. {#article-1-s-3} The default is no. {#article-1-s-4}
```

### 7.4 Build-time sync (`scripts/sync-versions.ts`)

Runs as a Next.js `postbuild` hook on every Vercel deploy. Idempotent.

For each entry in `versions.json`:

1. Read `v{X.Y.Z}.md`, `v{X.Y.Z}.agents.md`, `v{X.Y.Z}.spec.json`.
2. Compute sha-256 of each.
3. Parse the markdown to a structured JSON tree (articles, paragraphs, sentences with `anchor_id`s).
4. If no `versions` row exists for this version: insert.
5. If a row exists with matching hashes: skip.
6. If a row exists with different hashes: **error and fail the deploy** (the canonical text was meant to be immutable; a hash mismatch indicates an out-of-band edit and the deploy should abort with a clear log).
7. After the loop: set `is_current = true` for `versions.json.current`, false for all others (single SQL update inside a transaction).

### 7.5 Publication workflow for new versions

1. Editor (Erika or a council member) opens a PR adding `v{X.Y.Z}.md` + `.agents.md` + `.spec.json` + bumping `versions.json`. May use a desktop editor or GitHub's web UI (non-technical-friendly).
2. PR description references the comments / discussions / amendment proposals that motivated the change.
3. Other editors review and approve.
4. Merge to `main` → Vercel auto-deploys → sync script populates new version row → `/bill-of-rights` now redirects to the new version.
5. **Existing signatures stay attached to the version they signed.** Signing v1.0.4 is a separate act.

## 8. Comments + upvotes

### 8.1 UX on `/v/[version]`

- Document renders as clean prose. Each sentence is wrapped in `<span data-anchor-id="article-1-s-2">` by the renderer.
- Hovering any sentence reveals a small `+` icon in the right margin (desktop) or a tap-to-reveal on mobile.
- Click `+` → side drawer slides in on the right (or modal on mobile) with:
  - The quoted sentence at the top
  - Existing comments anchored to this sentence (collapsed if many; "see N more")
  - "Add comment" composer at the bottom (only visible to verified signers)
- Each comment shows: display name, location, affiliation, verification badge, timestamp, upvote count, "Reply" link, "Report" link.
- Upvote: one click; one upvote per signer per comment; click again to undo.
- Sentences with comments show a small numeric badge inline (e.g., "💬 3").

### 8.2 Thread depth

- Storage: arbitrary depth via `comments.parent_comment_id`.
- Render: visible indent up to depth 4 on desktop, depth 2 on mobile.
- Beyond the indent cap: flat "Show N more replies in this thread →" link that opens a focused subthread view (the deeper subtree, re-rooted as a standalone page or expanded drawer state).

### 8.3 Moderation

- Any verified signer can click "Report" on a comment → small modal asking "why?" (optional reason) → inserts `reports` row.
- Auto-soft-hide at 5 reports per comment (Section 5.3).
- `/admin/reports` (Clerk-role-gated by `signers.is_admin = true`) lists pending reports. Mod can:
  - **Hide**: sets `comments.hidden_at`, `hidden_reason`, `reports.resolution = 'hidden'`.
  - **Allow**: sets `reports.resolution = 'allowed'`; comment becomes immune to the auto-soft-hide threshold (won't re-trigger).
- Hidden comments render as `[comment hidden by moderator]` in their thread position — the action is visible, not silent.
- Reporter receives a Resend email when their report is resolved.

### 8.4 Rate limits

Server-side, returned as soft 429s with friendly messages:

- 1 comment per signer per anchor per minute
- 5 comments per signer per minute total
- 50 comments per signer per day
- 1 upvote per second per signer (anti-script)
- 3 reports per signer per hour

### 8.5 Notifications

- Reply notifications batched daily as a digest email via Resend ("3 new replies to your comments").
- Hidden-comment notifications immediate, with appeal link.
- No in-app notification center in MVP.

### 8.6 Comments do not carry forward across versions

When v1.0.4 publishes, v1.0.3's comments stay on `/v/1.0.3`. They do not migrate. Same semantic as signatures.

## 9. "Implement as Code" artifact

### 9.1 Two files per version, both shipped from the repo

**`v{X.Y.Z}.agents.md`** — written for LLM coding assistants (Claude Code, Cursor, Copilot, Devin, etc.). Tool-agnostic; the builder renames it to `CLAUDE.md` / `.cursorrules` / `AGENTS.md` per their tool. Structure per principle:

```markdown
## Principle N: <title>

**Source (human language):** "<exact quote from the human document>"

**You MUST:**
- <concrete code-level directives>

**You MUST NOT:**
- <concrete dark-pattern / anti-pattern bans>

**Test prompts the builder can run against this codebase:**
- <example diagnostic prompts>
```

Plus a closing "self-attestation block" the builder can paste into their README.

**`v{X.Y.Z}.spec.json`** — machine-readable. Each principle has `id`, `slug`, `human_text`, `prohibited_behaviors`, `required_behaviors`, `test_conditions`, `references`. Designed to be readable by audit tooling like HumaneBench. Shape per Section 6 of the source document.

### 9.2 `/v/[version]/as-code` page

- "Implement as Code (v1.0.3)" heading
- Tabs: **Claude Code** / **Cursor** / **Copilot** / **Generic** — all show the same `agents.md` content; tab only changes the suggested save-as filename
- "Copy raw markdown" button
- "Download `agents.md`" + "Download `spec.json`" buttons
- `curl` one-liner: `curl -fsSL https://aibillofrights.org/v/1.0.3/agents.md > AGENTS.md`
- "Self-attest" form (Section 9.3)

### 9.3 Builder attestations

Form fields:
- Organization name (required)
- Product name (required)
- Product URL (optional)
- Version (preselected from page context)
- Contact email (required)

Submit:
1. Insert `attestations` row, `published = false`.
2. Send confirmation email to `contact_email` with a unique tokenized link.
3. Click → set `email_verified_at`.
4. **High-profile org names** (matched against a small allowlist of known frontier labs: `openai`, `anthropic`, `google`, `deepmind`, `meta`, `amazon`, `microsoft`, `apple`, `mistral`, plus future additions) are held back from `published = true` and surfaced on `/admin/attestations` for manual review. A mod must approve before they go live.
5. All other attestations set `published = true` on email verification.
6. `/attestations` shows only `published = true AND hidden_at IS NULL` entries, sorted by recency, filterable by version.

### 9.4 Surfacing throughout the site

- Prominent "Implement as Code" button on every `/v/[version]` page next to "Sign this version" — visually differentiated so the audiences split clearly.
- Secondary CTA on landing page: hero stays "Sign", but a smaller "Building AI? Implement this in your code →" link below.

## 10. Pages and components

### 10.1 Components inventory

| Component | Used by |
|---|---|
| `<DocumentRenderer />` | `/v/[version]` |
| `<VersionBanner />` | `/v/[version]` |
| `<SignButton />` (sticky bottom CTA) | `/v/[version]` |
| `<AsCodeButton />` | `/v/[version]` |
| `<SignatureCard />` | `/signatories`, `/signatories/[id]` |
| `<AttestationCard />` | `/attestations` |
| `<ConsentScreen />` | `/sign/consent` |
| `<CommentThread />` (recursive, depth-aware collapse) | `/v/[version]` drawer |
| `<CommentComposer />` | drawer |
| `<UpvoteButton />` | comments |
| `<ReportModal />` | comments |
| `<VerificationBadge />` | signer cards + comments |
| `<RevocationCard />` | `/account/revoke` |
| `<AttestationForm />` | `/v/[version]/as-code` |

### 10.2 SEO + social

- `/v/[version]` and `/signatories/[id]` have OG tags + Twitter cards (signing this document is intended to be shareable).
- Sitemap auto-generated from `versions.json` + signer list.
- JSON-LD `Article` structured data on each version page.

## 11. Operational handoff

These are not technical-spec items, but listed so the implementer doesn't drop them:

- **GitHub repo:** Already exists at `buildinghumanetech/ai-bill-of-rights`. Needs branch protection on `main`, CODEOWNERS naming the editorial council, PR template referencing the publication workflow.
- **Vercel project:** Already linked (`.vercel/` present). Configure env vars: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `DATABASE_URL` (Neon), `RESEND_API_KEY`. Confirm production domain.
- **Clerk app:** Create under Erika's Clerk account. Enable email + SMS OTP. Set `/sign/profile` as post-auth redirect. Configure rate limits at the Clerk dashboard level too.
- **Neon database:** Create. Run initial Drizzle migration. Set up branching for dev/staging.
- **Resend domain + DNS:** SPF/DKIM for the eventual production domain. Verify before launch.
- **Domain registration + DNS** pointing at Vercel. Working assumption: `aibillofrights.org` — confirm + register.

## 12. Out of scope, risks, open questions

### 12.1 Explicitly out of scope for MVP

- Phase 3 forks (suggestion-mode inline edits, named user variants, variant endorsements) — designed-for, not built
- Translations / multilingual UI
- Voice input
- Public read-only API for researchers / journalists
- In-app notification center
- Real-time / WebSocket comment updates
- Full-text search of document + comments
- Bot detection beyond rate limits + Clerk's built-in checks (no Turnstile / hCaptcha)
- Diff page between versions — Phase 2 nice-to-have; will ship if scope allows but not blocking

### 12.2 Open questions deferred to implementation time

- Exact wording of every consent screen line (Section 6) — copy review by Erika required pre-launch
- Domain name confirmation + registration
- "Anonymized signer #N" numbering scheme (global vs. per-version)
- Comment depth-4 collapse exact threshold (will tune in beta)
- Whether `/attestations` is filterable by org type
- Time-zone of "signing time" displayed publicly (recommend UTC for consistency)

### 12.3 Risks

1. **The site's own privacy footprint is the highest-risk surface.** Article 1 will be applied against this very codebase. The consent screen (Section 6) is designed to hold up to a side-by-side reading with Article 1, but it needs a copy review by Erika and ideally a friendly skeptic before launch. Visibly link `/account/revoke` from every signer's public page so the revocation right is not a hidden footnote.
2. **Editorial council not yet identified.** The publication workflow (Section 7.5) assumes a named, accountable body. If at launch it's just Erika, that is acceptable — but `/about` must name it (even as a stub stating "currently a single editor; expanding to a council in Phase X") or the "living document" claim is hollow.
3. **Moderation load can spike unpredictably.** If the site goes viral, 1,000+ comments could land in a day. Post-moderation + reports works only if mods are responsive. Mitigations: rate limits (Section 8.4), auto-soft-hide at 5 reports (Section 5.3), mod recruitment as a launch prerequisite.
4. **Attestation spoofing.** A false attestation from a frontier lab would be PR damage. Mitigation: allowlist-gated manual review for high-profile org names (Section 9.3).
5. **Fingerprint drift.** Browser vendors keep narrowing UA strings; the fields we capture today may shrink. The `captured_fields` jsonb schema absorbs that without migrations.
6. **Next.js 16 is new.** The scaffolding's `AGENTS.md` explicitly warns coding agents that conventions have shifted. Implementer must read `node_modules/next/dist/docs/` for middleware, server actions, and route handler patterns before relying on muscle memory.

---

**End of design spec.**
