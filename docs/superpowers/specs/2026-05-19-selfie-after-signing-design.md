# Selfie After Signing — Design Spec

**Date:** 2026-05-19
**Status:** Approved (pre-implementation)
**Author:** Drafted with Claude via the superpowers brainstorming skill, in dialogue with the project owner
**Related:** `docs/superpowers/specs/2026-05-18-ai-bill-of-rights-design.md` (MVP spec)
**Branch:** `worktree-feat+selfie-after-signing` (worktree at `.claude/worktrees/feat+selfie-after-signing/`)

---

## 1. Goal

After a signer completes the sign flow, give them the opportunity to attach a photo of themselves to their public signer profile. Submitted photos require admin approval before becoming publicly visible. Capture must work easily on both desktop computers (webcam) and mobile devices (front-facing camera, or photo upload).

The feature's primary purpose is to **humanize the signer list** (photos make a list of names feel like real people backing the document) and **personalize the signer's own profile** (signers see their face on their public page and share it). Secondary benefits: a face attached to a name raises the bar above OTP-only verification, and approved selfies power richer OG images for social shares.

This feature is additive to the MVP. It does not change any existing data model — only extends it.

## 2. Scope

- Optional selfie capture, surfaced on `/sign/complete` immediately after signing, and re-accessible from `/account` anytime.
- Hybrid capture UX: live `getUserMedia` preview as the primary path, with file upload (`<input type="file" accept="image/*" capture="user">`) as a fallback that opens the native camera on mobile. Any user-supplied photo of themselves is acceptable (not strictly a live capture).
- Admin moderation queue at `/admin/selfies` with approve / reject (with reason) / view actions, plus tabs for pending / rejected / auto-hidden / approved photos.
- Reporting workflow mirroring comment moderation: verified signers can report selfies; threshold of 3 unresolved reports auto-hides the photo pending admin re-review.
- Email notifications to signers via Resend on approve / reject (with reason) / auto-hide.
- Unlimited retakes and replacements. Previously-approved photo remains visible while a replacement is in review.
- Display of approved selfies as a 120px circular avatar on `/signatories/[id]`, as a 48px thumbnail on `/signatories`, and in the `/api/og/signer/[id]` social-share image.
- Revocation of the entire signer account (via `/account/revoke`) deletes all selfies and associated blob storage. A separate "Remove my photo" action removes just the photo.

Explicitly out of scope for this feature (Section 12).

## 3. Decisions log

Captured during brainstorming so the implementer does not need to re-derive them.

| # | Decision | Rationale |
|---|---|---|
| 1 | Selfie is optional with a "Skip for now" link on `/sign/complete` | Owner's call. Article 1 framing makes any required biometric collection awkward. |
| 2 | Available on `/sign/complete` AND `/account` (re-accessible anytime) | Captures motivation-in-the-moment for most signers, while giving a humane path for skip/retake/rejection-replace. |
| 3 | Hybrid capture: live `getUserMedia` primary, file upload fallback | Best UX on desktop (live preview) AND mobile (native front camera). File upload also accommodates "I want to use my professional headshot." |
| 4 | Any user-supplied photo accepted, not strictly live capture | Headshot uploads are a legitimate use case and pass the same admin review. |
| 5 | Inline disclaimer near the capture button (no separate consent screen) | Owner's call. The disclaimer is auditable (lives in repo), revocation is one click from `/account`. |
| 6 | Admin review criteria: real human face, not offensive/NSFW/hateful, not obvious imposter content, no PII overlays | Plain-language criteria; admin can't actually verify identity — only flag obvious fraud. |
| 7 | Reporting mirrors comment moderation, threshold 3 (lower than comments' 5) | Faces are higher-stakes than comments; same defensive backstop, tighter trigger. |
| 8 | Notify signer via Resend on approve / reject / auto-hide | Email infrastructure already wired. On-submit confirmation is in-page only. |
| 9 | Unlimited retake/replace; previous-approved photo stays live during review | Avoids leaving signers face-less during the review gap. |
| 10 | 120px avatar on signer profile + 48px thumbnail in list + selfie in OG image | All three surfaces from the brainstorm; placeholder for signers without an approved selfie. |
| 11 | Vercel Blob, three derived sizes per upload | Original (private, 2048px max JPEG, for admin/audit), display (public WebP 512×512), thumbnail (public WebP 96×96). |
| 12 | Server-action upload + `sharp` resize (Approach A) | Matches existing `src/server/actions/` convention; scale doesn't justify direct-to-blob client uploads yet. |
| 13 | Dedicated `/admin/selfies` page | Visual review work; cramming into `/admin/signers` would hurt the UX. |

## 4. Architecture

### 4.1 New routes

| Route | Purpose |
|---|---|
| `/sign/complete` | Existing. Add `<SelfieCapture context="post-sign" />` block plus a "Skip for now" link. |
| `/account` | Existing. Add `<SelfieCard />` showing current status (none / pending / approved / rejected with reason / auto-hidden with appeal) with retake/replace CTA opening `<SelfieCapture context="account" />`. |
| `/account/revoke` | Existing. Selfie removal folded into the revocation transaction. Update copy to mention the photo. |
| `/signatories/[id]` | Existing. Render approved active selfie as a 120px circular avatar next to display name. |
| `/signatories` | Existing. Render 48px thumbnails per row via `<SignatureCard />`. Neutral placeholder when none. |
| `/admin/selfies` | **New.** Admin-gated gallery + approve/reject UI. Tabs: pending / rejected / auto-hidden / approved. |
| `/api/og/signer/[id]` | **New.** Server-rendered OG image (1200×630) using `next/og`. Includes selfie when approved; falls back to generic card. |

### 4.2 Server actions (new file `src/server/actions/selfie.ts`)

- `submitSelfieAction(formData)` — verified signer only. Validates input (size, MIME, dimensions), resizes via `sharp` into three sizes, uploads to Vercel Blob (original private, display + thumbnail public), inserts `selfies` row with status `pending`. Rate-limited at 5 submissions per signer per hour.
- `approveSelfieAction(selfieId)` — admin only. Updates row to `approved`, sets `reviewedBy` + `reviewedAt`, sends approval email, revalidates relevant paths.
- `rejectSelfieAction(selfieId, reason, note?)` — admin only. Updates row to `rejected` with one of the enumerated reasons, sends rejection email with reason and retake link.
- `reportSelfieAction(selfieId, reason?)` — verified signer only. Inserts `selfie_reports` row. If unresolved-report count for the target selfie now equals or exceeds the threshold (3), sets `auto_hidden_at` and emails the affected signer with an appeal link.
- `removeMySelfieAction()` — signer only. Soft-deletes the active selfie row (sets `removed_at = now()`) and best-effort deletes the public display + thumbnail blobs. Original kept for an audit window (no automatic purge in MVP — purge is part of full revocation).
- `resolveSelfieReportAction(selfieId, resolution)` — admin only. Marks open `selfie_reports` for the target selfie as `allowed` (restore) or `hidden` (convert to rejected + email).

All actions use the lazy `getDb()` pattern established in `src/server/actions/sign.ts` for testability.

### 4.3 New library code

- `src/lib/storage/blob.ts` — thin wrapper around `@vercel/blob` exposing `uploadSelfieBlob(buffer, { signerId, selfieId, kind, mime, access })` and `deleteBlobByUrl(url)`. Encapsulates the bucket-path convention and `access: 'public' | 'private'` flag.
- `src/lib/images/process.ts` — `sharp`-based pipeline. Input: a Node `Buffer`. Output: `{ original: Buffer, display: Buffer, thumbnail: Buffer, originalMime: string, dimensions: { width, height } }`. Handles JPEG / PNG / WebP / HEIC. Auto-rotates per EXIF, strips all EXIF metadata, center-crops the display + thumbnail outputs.
- `src/lib/selfie/policy.ts` — pure validation. Exports `validateSelfieInput({ buffer, mime, declaredSize })` returning `{ ok: true } | { ok: false, reason }`. Enforces ≤10 MB, allowed MIME list, max input dimensions 8000×8000 (prevents OOM in `sharp`).
- `src/lib/selfie/rateLimit.ts` — `assertSubmissionRate(signerId, db)` — counts `selfies` rows for the signer in the last 60 minutes; throws a friendly error if ≥5.
- `src/lib/selfie/queries.ts` — query helpers: `getActiveSelfieForSigner`, `getActiveSelfiesForSigners` (batch for `/signatories` list), `getPendingSelfies`, `getAutoHiddenSelfies`, `getRecentlyReviewedSelfies`, `countUnresolvedReports`. Mirrors the lazy-`db` pattern from `src/lib/db/queries.ts`.

### 4.4 New components

- `<SelfieCapture context="post-sign" | "account" />` — client component. Detects camera availability via `navigator.mediaDevices.getUserMedia`. Shows "Take photo" + "Upload existing photo" buttons; capture flow uses a `<video>` preview and `<canvas>` snapshot, then submits via `submitSelfieAction`. Handles permission-denied gracefully by hiding the live-capture branch and surfacing the upload branch.
- `<SelfieAvatar size="sm" | "md" | "lg" signerId displayName />` — server component used wherever a signer's photo is shown. Resolves to the public display URL when an approved active selfie exists; otherwise renders a circular placeholder with initials derived from `displayName`. Single component, single source of truth for placeholder behavior.
- `<SelfieCard />` — client component for `/account` summarizing the signer's current selfie status. Shows: thumbnail of current photo (or empty state), status badge, last-action timestamp, and contextual CTA ("Add a photo" / "Retake" / "Replace" / "Try again" depending on state).
- `<SelfieStatusBadge status reason? />` — small inline badge: pending (amber), approved (green), rejected with reason (red), auto-hidden (orange + "appeal" link).
- `<SelfieReviewCard />` — admin-only. Renders the full submitted display photo (~400px max), signer context (name, affiliation, location, verification badge, member since), submitted timestamp, capture method, and approve/reject buttons. Reject opens an inline reason picker.
- `<ReportSelfieButton />` — visible on `/signatories/[id]` to signed-in verified signers (not the owner). Opens a modal with an optional "why" reason; submits to `reportSelfieAction`. Mirrors the existing comment-report modal pattern (which will be added in the comment moderation Phase 2 work; here, the pattern is established freshly).

### 4.5 New email templates

Three additions to `src/lib/email/templates.ts`:

- `selfieApproved({ displayName, signerPageUrl, accountUrl })` — "Your photo is live."
- `selfieRejected({ displayName, reason, accountUrl })` — "We weren't able to publish your photo." Reason mapped to plain-language sentence.
- `selfieAutoHidden({ displayName, appealUrl })` — "Your photo was temporarily hidden after multiple reports." Links to `/account` where they can appeal.

## 5. Data model

### 5.1 `selfies` table

```typescript
selfies {
  id: uuid primary key default gen_random_uuid()
  signer_id: uuid not null references signers(id)

  status: text not null   // 'pending' | 'approved' | 'rejected' | 'auto_hidden' | 'removed'

  // Vercel Blob URLs — original is private, derived sizes become "live" on approval
  original_blob_url: text not null
  display_blob_url: text not null
  thumbnail_blob_url: text not null

  // Original file metadata
  original_mime: text not null  // 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic'
  original_bytes: integer not null

  // Capture metadata (light fingerprint, helps spot bulk uploads)
  capture_method: text not null   // 'live' | 'upload'

  // Lifecycle timestamps
  submitted_at: timestamp not null default now()
  reviewed_at: timestamp   // set when approved or rejected
  reviewed_by: uuid references signers(id)   // admin who acted
  rejection_reason: text   // 'not_a_face' | 'offensive' | 'imposter' | 'pii_overlay' | 'other'
  rejection_note: text   // optional admin freeform note (private to admins)
  auto_hidden_at: timestamp
  removed_at: timestamp

  // Forward-compat: link from previous photo to its replacement
  replaced_by_selfie_id: uuid references selfies(id)
}
```

The "active" selfie for a signer is the row matching:
`signer_id = X AND status = 'approved' AND auto_hidden_at IS NULL AND removed_at IS NULL AND replaced_by_selfie_id IS NULL`

Application-layer invariant: a single signer has at most one row matching the active predicate at any time. Enforced via a partial unique index (Section 5.3).

### 5.2 `selfie_reports` table

```typescript
selfie_reports {
  id: uuid primary key default gen_random_uuid()
  selfie_id: uuid not null references selfies(id)
  reporter_signer_id: uuid not null references signers(id)
  reason: text   // optional freeform
  created_at: timestamp not null default now()
  resolved_at: timestamp
  resolved_by: uuid references signers(id)
  resolution: text   // 'allowed' | 'hidden'

  // Prevent one reporter spamming reports on the same selfie
  unique (selfie_id, reporter_signer_id)
}
```

### 5.3 Indexes

- `selfies_signer_active_unique` — **partial unique** on `signer_id` where `status = 'approved' AND auto_hidden_at IS NULL AND removed_at IS NULL AND replaced_by_selfie_id IS NULL`. Enforces "at most one active selfie per signer" at the database layer. (See note in Section 5.5 about drizzle's handling of partial uniques.)
- `selfies_status_submitted_at_idx` — partial index on `(status, submitted_at desc)` where `status = 'pending'` — powers the `/admin/selfies` queue.
- `selfies_signer_id_idx` — for active-selfie lookups by signer (avoids full scan when computing avatars in `/signatories`).
- `selfie_reports_selfie_unresolved_idx` — partial on `selfie_id` where `resolved_at IS NULL` — supports the threshold-check query when a new report arrives.
- `selfie_reports_selfie_reporter_unique` — unique on `(selfie_id, reporter_signer_id)`.

### 5.4 Auto-hide rule

When a new `selfie_reports` row inserts, the server action runs a count query for unresolved reports against the same selfie. If the count is ≥ 3, the action sets `selfies.auto_hidden_at = now()` and triggers the auto-hidden email. Configurable via a constant in `src/lib/selfie/policy.ts` (`SELFIE_AUTO_HIDE_THRESHOLD = 3`).

### 5.5 Drizzle schema note

The MVP spec (Section 5) and the existing `versions` table already accept the limitation that drizzle 0.36's partial-unique index handling is fragile. The same trade-off applies here: rather than encoding the active-selfie partial-unique in drizzle directly, the migration SQL hand-writes it. Drizzle schema declares the table; the partial unique is added via a `CREATE UNIQUE INDEX ... WHERE ...` statement in the same migration file. Application code in `submitSelfieAction` and `approveSelfieAction` still asserts the invariant defensively (transition prior active selfies to `replaced_by_selfie_id = newSelfieId` before approving the new row).

## 6. Capture UX flow

### 6.1 Surface on `/sign/complete`

After the existing "Signed." headline and "See your public page →" CTA, render a section with:

> **Add your photo (optional)**
>
> Put a face to your name on your signer profile. Submitted photos are briefly reviewed by an admin before they go live.
>
> [Take photo]   [Upload existing photo]
>
> *Your photo will be shown on your public profile after a brief admin review. You can remove it anytime from your account. We do not run face recognition and do not share your photo with third parties.*
>
> [Skip for now]

### 6.2 Surface on `/account`

A new `<SelfieCard />` section between the profile form and the signatures list. States:

- **None on file:** "Add your photo →" CTA opening the same flow as `/sign/complete`.
- **Pending review:** thumbnail of submitted photo, amber badge "Pending review" with submitted timestamp.
- **Approved + active:** thumbnail, green badge "Live on your profile", "Replace" + "Remove" actions.
- **Rejected:** thumbnail (so the user remembers what they submitted), red badge "Couldn't publish: {plain-language reason}", "Try again" CTA.
- **Auto-hidden:** thumbnail, orange badge "Temporarily hidden after reports", "Submit a new photo" CTA, link to email admin if they think it's a mistake.

### 6.3 The capture component

`<SelfieCapture context>` initial render:

1. Heading "Add your photo (optional)" (skip in `/account` context — the parent card has its own heading).
2. Inline disclaimer (the same paragraph as Section 6.1).
3. Two primary buttons side-by-side: **Take photo** and **Upload existing photo**.
4. "Skip for now" link below (post-sign context only).

Live-capture branch:

1. Click "Take photo" → component calls `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })`.
2. On permission grant: render `<video autoPlay playsInline muted>` showing the front camera. Below: round "Capture" button.
3. On capture: pause `<video>`, draw the current frame to a `<canvas>`, hide the video, show the canvas snapshot at the same dimensions.
4. Options: "Use this photo" / "Retake" / "Cancel".
5. On "Use this photo": `canvas.toBlob` (JPEG, quality 0.92). Build FormData with the blob and a `captureMethod=live` flag. Submit to `submitSelfieAction`.
6. On permission denied or no camera: silently fall through to the upload branch UI and show a one-line note "No camera available — upload a photo instead."

Upload branch:

1. Click "Upload existing photo" → triggers a hidden `<input type="file" accept="image/*" capture="user">`.
2. On mobile, this opens the native camera with the front-facing camera preselected; on desktop, it opens the file picker.
3. On file selected: read into a preview thumbnail. Same "Use this / Choose different / Cancel" controls.
4. On "Use this": FormData with the file + `captureMethod=upload`. Submit.

Post-submission UI: the page reloads (via server action redirect) and the relevant surface (`/sign/complete` or `/account`) now shows the "Pending review" state.

### 6.4 Mobile + desktop parity

- Live capture works on both. Mobile selects front camera via `facingMode: 'user'`. Desktop uses the default video device (typically the laptop camera).
- File upload `capture="user"` is a no-op hint on desktop browsers (they show the regular file picker). On iOS Safari and Android Chrome, it opens the native camera.
- No vendor-specific code paths.

## 7. Moderation flow

### 7.1 `/admin/selfies` layout

Top of page: tab bar — **Pending** (default, badge with unresolved count) / **Auto-hidden** / **Rejected** / **Approved**.

Pending tab: grid of `<SelfieReviewCard />` items, newest first. Each card shows:

- Display photo (~400px max width).
- Signer name, affiliation, location, verification badge.
- "Member since {createdAt}" + "Submitted {submittedAt}".
- Capture method (`Live capture` / `Upload`).
- Buttons: **Approve** / **Reject** (opens reason dropdown below).
- Link to `/signatories/[id]` for full context (opens in new tab).

Reject reason dropdown:

- Not a real face / Offensive / Possible imposter / Personal info visible / Other (with required free-text note when "Other").
- Optional admin note field (private; not surfaced to the signer).

Auto-hidden tab: shows the same card plus an "X reports" badge with the report reasons listed. Two actions: **Restore** (resolves all open reports as `allowed`, removes the auto-hide, immunizes against the same threshold re-triggering) / **Reject** (converts to rejected, same flow).

Rejected + Approved tabs: read-only views with timestamps and (for rejected) the reason on record. Approved tab supports a "Manually unpublish" admin action (rare).

### 7.2 Reporting from `/signatories/[id]`

The `<ReportSelfieButton />` is rendered only when:

- The viewer is signed in.
- The viewer's `clerk_user_id` is not the same as the profile owner.
- The profile owner currently has an active approved selfie displayed.

Click opens a modal: "Report this photo" with optional "why" reason and a Submit button. Calls `reportSelfieAction`. On success, the modal closes and a small "Thanks — we'll review it." toast appears. Idempotent: if the same reporter has already reported this selfie, the action no-ops (the unique constraint on `(selfie_id, reporter_signer_id)` makes this safe).

### 7.3 Notifications

Sent via Resend (`src/lib/email/send.ts`). Each email includes the signer's display name, the action taken, and a link.

- **Approved** → "Your photo is live on the AI Bill of Rights signer page" + link to `/signatories/[id]`.
- **Rejected** → "We couldn't publish your photo" + plain-language reason + link to `/account` to retake.
- **Auto-hidden** → "Your photo was temporarily hidden after reports from other signers" + appeal link to `/account` (where they can submit a new photo or email the admin).

Email send failure does not block the underlying admin action — wrapped in a try/catch like the existing sign-confirmation email.

## 8. Storage + image processing

### 8.1 Vercel Blob

Uses `@vercel/blob` with `BLOB_READ_WRITE_TOKEN` env var. Blob paths:

```
selfies/<signer_id>/<selfie_id>/original.jpg     access: private
selfies/<signer_id>/<selfie_id>/display.webp     access: public (URL-stable)
selfies/<signer_id>/<selfie_id>/thumbnail.webp   access: public
```

The path scheme keeps a signer's selfies grouped (helpful when bulk-cleaning during revocation). The display and thumbnail blobs are uploaded as public from the start — they live at deterministic URLs but are not linked from anywhere in the rendered HTML until `status = 'approved'`. (Hard-to-guess random suffix in the URL means there's no realistic enumeration risk; this matches Vercel Blob's intended pattern.)

If we later need stricter pre-approval privacy, an upgrade path is straightforward: upload to private on submission, then re-upload as public on approval. Out of scope for MVP.

### 8.2 `sharp` pipeline

Single call to `process(buffer)` returns `{ original, display, thumbnail }`:

- **Original**: re-encoded JPEG. Auto-rotated per EXIF. EXIF stripped. Max 2048×2048 (preserves aspect; only downscales — never upscales). Quality 92.
- **Display**: WebP. Center-cropped to a square then resized to 512×512. EXIF stripped. Quality 85.
- **Thumbnail**: WebP. Same crop, resized to 96×96. Quality 80.

No face detection or alignment in MVP — admins are reviewing photos visually, and the center-crop produces acceptable framing for most headshot-style inputs. If a poorly framed crop becomes a common reject reason, we can revisit (e.g., add `sharp.metadata()` + smartcrop).

### 8.3 DoS protection (`src/lib/selfie/policy.ts`)

Constants and validators:

- `MAX_INPUT_BYTES = 10 * 1024 * 1024` (10 MB).
- `ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']`.
- `MAX_INPUT_DIMENSION = 8000` (validate via `sharp.metadata()` before resize to avoid the libvips memory blowup on absurd inputs).
- `SELFIE_RATE_LIMIT_PER_HOUR = 5`.
- `SELFIE_AUTO_HIDE_THRESHOLD = 3`.

`validateSelfieInput(buffer, declaredMime)` checks size and MIME. The dimension check runs after `sharp.metadata()` succeeds — we can't trust a declared MIME alone.

## 9. Revocation + Article 1 consistency

### 9.1 Standalone "Remove my photo"

Available from `<SelfieCard />` on `/account`. Soft-deletes the active selfie (sets `removed_at = now()`) and best-effort deletes the public display + thumbnail blobs immediately. The original blob is retained for an audit window (no automatic purge in MVP — it gets purged on full account revocation).

### 9.2 Full account revocation (`/account/revoke`)

The existing `submitRevokeAction` is extended:

1. Look up all `selfies` rows for the signer.
2. For each: best-effort delete original / display / thumbnail blobs.
3. Delete the `selfies` rows. (Hard delete — same semantic as how `submitRevokeAction` already handles signer data.)
4. Delete all `selfie_reports` rows where the signer is either the target's owner or the reporter (mirrors the cascade pattern in `deleteSignerAction`).

Update `/account/revoke` copy to add a fourth bullet:

> Delete any photo you uploaded, including all backup copies.

### 9.3 Article 1 framing

Article 1 of the document requires explicit, informed, revocable consent for personal data. The inline disclaimer near the capture button (Section 6.1) is the "informed" half; the always-available `/account` removal path is the "revocable" half. The "explicit" half is the user's deliberate act of clicking "Take photo" or "Upload existing photo" — both unambiguous gestures, neither preselected nor buried.

The disclaimer text lives at `content/selfie/disclaimer.md` so changes are auditable in git history. If the language ever materially changes (e.g., adding a new use of the photo), a `selfies.disclaimer_hash` column gets added in a follow-up migration; for MVP, we accept that the disclaimer is currently a single version and rely on git history for the audit trail.

## 10. Display surfaces

### 10.1 `<SelfieAvatar size signerId displayName />`

Single server component with three sizes:

- `sm` — 48px circle, used in `<SignatureCard />` and admin listings.
- `md` — 120px circle, used at the top of `/signatories/[id]`.
- `lg` — 360px square, used by the OG image route.

Behavior: queries (via `getActiveSelfieForSigner`) for the signer's active approved selfie. If found, renders an `<img>` (or `<Image>` from `next/image`) pointing at the public display or thumbnail blob URL (size-appropriate). If not found, renders a colored circle with the first letter(s) of `displayName` (1 letter if single word, 2 if multi — same logic as common avatar placeholders).

The component is cheap to call repeatedly on `/signatories` because the list page does a single batched query (`getActiveSelfiesForSigners([id1, id2, ...])`) and passes results down — the avatar component reads from a context-provided map when available. Falls back to per-call query when no map is present.

### 10.2 `/signatories/[id]` profile

Place `<SelfieAvatar size="md" />` above (or to the left of) the display-name heading on the existing profile page. On mobile, stacks above; on desktop ≥640px, sits to the left with name + verification badge to the right.

### 10.3 `/signatories` list (via `<SignatureCard />`)

Modify `<SignatureCard />` to render `<SelfieAvatar size="sm" />` on the left, name + version + signed-at on the right. The existing card layout is single-line; we expand to a two-column layout with the avatar pinned left.

### 10.4 OG image (`/api/og/signer/[id]`)

Uses `next/og`'s `ImageResponse`. The 1200×630 image composition:

- Left column (~400px): `<SelfieAvatar size="lg" />` if approved selfie exists; otherwise the default "AI Bill of Rights" logo.
- Right column: signer display name (large), verification badge, "A signer of the AI Bill of Rights" footer.

Update `generateMetadata` in `/signatories/[id]/page.tsx` to point `openGraph.images` and `twitter.images` at this new route.

## 11. Error handling

| Scenario | Behavior |
|---|---|
| Camera permission denied | Live-capture branch hidden with a one-line note; upload branch remains available. |
| No camera on device | Live-capture button hidden entirely; only the upload branch shown. |
| Browser can't decode HEIC for preview | Skip the client-side preview ("Preview unavailable — your photo will be reviewed after upload"); server `sharp` handles HEIC decode. |
| File over 10 MB | Inline error before upload: "Photos must be 10 MB or smaller. Try a smaller photo or take a new one." |
| Disallowed MIME | "We accept JPEG, PNG, WebP, and HEIC photos." |
| Image dimensions >8000px either side | "That photo is unusually large. Please use a smaller original." |
| Rate-limited (≥5 submissions in last hour) | "You've submitted a lot of photos recently. Take a break and try again in an hour." |
| Blob upload partial failure | The server action's try/finally attempts to clean up any successfully uploaded blobs before returning the error. DB row is not inserted. |
| DB insert failure after blob success | Cleanup all 3 blobs in a finally block, bubble the error. |
| Already-approved photo replacement | New submission is `pending`; previously-approved photo retains active status until the new one is approved or rejected. On approval of the new one, the previous row's `replaced_by_selfie_id` is set to the new row's id (which excludes it from the active predicate). |
| Admin tries to approve an already-rejected/removed row | Server-side guard: action throws "Selfie is no longer pending"; UI refreshes. |

## 12. Testing

The project already has a vitest setup with a pglite-based in-memory Postgres helper (`tests/_helpers/pglite-db.ts`). New tests:

- `tests/lib/selfie.policy.test.ts` — `validateSelfieInput` happy + each rejection reason.
- `tests/lib/selfie.queries.test.ts` — `getActiveSelfieForSigner` (returns active approved; ignores pending/rejected/replaced/removed); `getActiveSelfiesForSigners` (batch); `countUnresolvedReports`.
- `tests/server/selfie.submit.test.ts` — happy path inserts a `pending` row; second submission while one is pending inserts another `pending` row (replaces in queue); rate-limit kicks in at 6th submission in an hour; the active-approved invariant is preserved when a replacement is approved.
- `tests/server/selfie.review.test.ts` — `approveSelfieAction` transitions pending → approved; `rejectSelfieAction` records the reason; both require admin; the email send is mocked.
- `tests/server/selfie.report.test.ts` — first report inserts a row; reaching the threshold sets `auto_hidden_at`; duplicate reports from the same reporter are rejected by the unique constraint without raising; `resolveSelfieReportAction("allowed")` clears the auto-hide.
- `tests/server/revoke.test.ts` — extend the existing revoke test to verify selfies + selfie_reports rows are deleted on full revocation. (Blob deletion is mocked — the test asserts the deletion call was made.)

Tests use a fake blob storage adapter (injected via DI on the server actions) so we never hit real Vercel Blob in unit tests. The image-processing pipeline is exercised separately (`tests/lib/images.process.test.ts`) with a tiny 16×16 fixture PNG, asserting the three outputs have the expected dimensions and MIME signatures.

The pglite helper (`tests/_helpers/pglite-db.ts`) is extended with the `selfies` and `selfie_reports` table DDL — mirroring the migration the implementer will generate.

## 13. Out of scope, risks, open questions

### 13.1 Out of scope for this feature

- Face detection or face-matching against any external identity source.
- Automated content moderation via cloud APIs (e.g., AWS Rekognition NSFW detection). Could be added later as a pre-admin filter; not in MVP.
- Cropping UI on the client side. Admins reject for bad framing; users retake.
- Multiple photos per signer (gallery). Only one active.
- Animated selfies / video / live-streaming.
- Photo on comments. Phase 2's `<CommentThread />` could grow avatars later by reading from the same `<SelfieAvatar />` component, but no work is required here.

### 13.2 Open questions deferred to implementation time

- Exact placeholder color for `<SelfieAvatar />` initials — pick a neutral that doesn't clash with the existing zinc palette.
- Whether to show the auto-hide threshold publicly (probably not — same as the comment threshold isn't surfaced).
- Whether to email admins when a new selfie hits the queue (probably yes, batched daily; deferred — for now the admin checks `/admin/selfies` on their cadence).

### 13.3 Risks

1. **Article 1 framing risk.** Per the project's parent spec, the codebase will be held up against Article 1. A photo of a face is sensitive. Mitigation: inline disclaimer near capture; one-click removal from `/account`; full purge on full revocation; no face recognition; explicit "we don't share with third parties" claim.
2. **Moderation latency.** If admin review takes days, signers will get a poor experience. Mitigation: emails on every status change; `/account` always shows clear state; pending photo has no public exposure.
3. **Imposter selfies.** An admin can be fooled by a plausible-looking stock photo. Mitigation: report-based community defense (threshold 3 + appeal flow). Acceptable residual risk for MVP.
4. **Storage cost drift.** A successful site could push storage costs up. Mitigation: the 2048px original cap and WebP derivatives keep per-signer storage well under 1 MB. Vercel Blob pricing scales linearly; revisit if signer count crosses ~50k.
5. **HEIC handling.** iOS uploads often default to HEIC, and not all sharp builds include libheif. Mitigation: explicit dependency on `sharp` with HEIC support; fallback message if HEIC decode fails server-side ("We couldn't read this photo. Try converting it to JPEG.").
6. **Blob cleanup races.** A user could rapidly submit, approve, and replace, causing cleanup of a blob that's still referenced. Mitigation: cleanup operations always read the row's current state, and operate by URL — `deleteBlobByUrl` is idempotent (404 is silently OK).

---

**End of design spec.**
