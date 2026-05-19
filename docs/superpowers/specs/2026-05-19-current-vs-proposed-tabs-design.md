# Design: Current vs Proposed tabs + proposed-edits workflow

**Status:** Self-reviewed; awaiting user review.
**Author:** Claude (Opus 4.7) in collaboration with Daniel Odio.
**Date:** 2026-05-19.

## Goal

Turn the AI Bill of Rights from a static signable document into a community-edited living one. People who care about the principles should be able to propose specific text changes, discuss them with each other, and watch admins curate the next version into existence. Old published versions remain immutable archives.

The primary jobs to be done:

1. **A reader on `/`** sees today's canonical Bill, signs it if they want, and optionally highlights any sentence to leave a comment OR propose a sentence-level edit.
2. **A reader on `/proposed`** sees a preview of what the next version will look like (with accepted edits already merged in) and inline markers on sentences that have pending proposals. They can browse proposals, upvote them, and add their own.
3. **An admin** triages proposed edits, accepts the ones they want in the next version, and when ready clicks "Release v0.0.2" to publish the next version. Choosing the bump tier (patch / minor / major) is part of the release click.
4. **An endorser** of `/proposed` gets emailed when their endorsed draft ships, asking them to convert their endorsement into a real signature on the new immutable version.

## URL structure

- `/` — Current Bill. Default landing. Shows the latest published version (right now v0.0.1). Has the sign button, highlight-to-Comment, highlight-to-Suggest-Changes.
- `/proposed` — Working draft for the next version. Shows the doc with accepted edits already merged in (preview), pending proposals as inline markers, an "Endorse direction" button, highlight-to-Comment, highlight-to-Suggest-Changes.
- `/v/[version]` — Archive view of any published version. No comments, no edits, no sign button on past versions. Shipped in PR #7.
- `/admin/proposals` — Admin review queue for pending proposals. (New.)
- `/admin/release` — Admin release page. (New.)

Tabs at the top of `/` and `/proposed` swap between the two; the tab bar makes the relationship visible to users.

## Tab semantics

**`/` (Current — read-only doc, interactive surface):**

- Renders the latest published version using the archive-style typography (`DocumentRenderer readOnly`) but with the sentence-level interaction layer on top.
- Every sentence has a hover affordance: highlight → popup with two actions, **Comment** (lightweight thought, no replacement text) or **Suggest Changes** (proposes a replacement, insert-after, or delete).
- Sign button (`FloatingSignButton`) is visible and works as today.
- The sentence count + comments count + proposals count is visible per article (subtle, e.g. a small badge).

**`/proposed` (Proposed — preview + interactive surface):**

- Same article layout as Current, BUT every accepted proposal is rendered as if it were already part of the doc (so you see the next version's text, not the current text, wherever an accepted edit exists).
- Sentences that have **pending** proposals get a yellow underline; clicking opens a side panel with the proposal(s), upvotes, replies, and the admin's "Accept / Reject" buttons if the viewer is an admin.
- Sentences that have **accepted** proposals get a faint green left border; clicking shows what changed and who proposed it.
- No sign button. Instead, an **"Endorse direction"** button: signs the user up to be emailed when this draft ships, with a one-click signature conversion.
- Banner at the top: "This is a working draft of v0.0.2. Admins will release it when ready."
- Highlight-to-Comment + highlight-to-Suggest-Changes work the same way as on Current.

## Edit lifecycle

A proposed edit moves through these states:

```
       ┌──────────────┐  admin accepts   ┌──────────────┐
       │   pending    │ ───────────────► │   accepted   │
       │              │                  │              │
       └──────┬───────┘                  └──────┬───────┘
              │                                 │
   admin rejects                       admin clicks Release
              │                                 │
              ▼                                 ▼
       ┌──────────────┐                  ┌──────────────┐
       │   rejected   │                  │  published   │
       └──────────────┘                  │ (in a version │
                                         │  that shipped)│
                                         └──────────────┘
                                                ▲
                                                │
                                                │ admin clicks Release
                                                │ on a different proposal in the same round
       ┌──────────────┐                         │
       │  pending     │ admin clicks Release    │
       │ (not yet     │ ────────────────────────┘ (these become "stale")
       │   accepted)  │
       └──────┬───────┘
              │ release happens
              ▼
       ┌──────────────┐
       │    stale     │  admin can re-promote → back to pending
       └──────────────┘
```

States:

- **pending** — proposer submitted, waiting on admin action.
- **accepted** — admin clicked Accept. The edit applies on the `/proposed` preview but the proposed version row doesn't exist yet.
- **rejected** — admin clicked Reject. Visible in archive view; cannot be re-promoted.
- **published** — the version containing this edit shipped (admin clicked Release). The edit is now part of an immutable version.
- **stale** — at release time, all `pending` proposals are auto-marked stale (per user direction: clean slate each round). Visible in a "stale proposals" archive; admin can manually re-promote one back to `pending` if they want it considered again.

## Who can do what

| Actor | Read Current | Read Proposed | Sign | Endorse | Comment | Suggest edit | Accept / Reject | Release |
|---|---|---|---|---|---|---|---|---|
| Anonymous | ✅ | ✅ | nudged to Clerk OTP | nudged to Clerk OTP | nudged to Clerk OTP | nudged to Clerk OTP | ❌ | ❌ |
| Authenticated signer | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Soft-banned signer | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Admin | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Anonymous compose: a user can start typing a Comment or Suggest Changes without being signed in. On Submit, the form draft is saved to `localStorage` and the user is taken through Clerk OTP. On return, the draft is re-hydrated and submitted under their new identity.

## Data model

Four new tables. No schema changes to existing tables (`signers`, `signatures`, `consent_records`, `versions`). The closed Phase 3 PR (#4) is being superseded, not re-introduced — its `comments`/`comment_upvotes`/`reports` definitions don't carry over; we redefine `comments` here with a polymorphic anchor and add `proposed_edits`, `proposal_upvotes`, and `endorsements`.

### `proposed_edits`

```ts
export const proposedEdits = pgTable("proposed_edits", {
  id: uuid("id").defaultRandom().primaryKey(),
  // The version this proposal targets. When the version is released
  // and a new draft begins, this stays pointed at the original target.
  baseVersionId: uuid("base_version_id").notNull().references(() => versions.id),
  proposerSignerId: uuid("proposer_signer_id").notNull().references(() => signers.id),
  // 'replace' = swap a sentence's text. 'insert_after' = add a new sentence
  // after the targeted one. 'delete' = remove the targeted sentence.
  kind: text("kind", { enum: ["replace", "insert_after", "delete"] }).notNull(),
  // The anchor id from the parsed document (e.g. "article-1-s-3"). For
  // 'insert_after', this is the anchor of the sentence the new one goes after.
  targetAnchorId: text("target_anchor_id").notNull(),
  // The proposed text. Null for 'delete'.
  newText: text("new_text"),
  // The rationale the proposer typed; surfaced to admins + commenters.
  rationale: text("rationale"),
  // 'pending' | 'accepted' | 'rejected' | 'stale' | 'published'.
  status: text("status", {
    enum: ["pending", "accepted", "rejected", "stale", "published"],
  }).notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: uuid("decided_by").references(() => signers.id),
  // If the proposal got published, which version row absorbed it.
  publishedInVersionId: uuid("published_in_version_id").references(() => versions.id),
});
```

### `proposal_upvotes`

```ts
export const proposalUpvotes = pgTable("proposal_upvotes", {
  proposalId: uuid("proposal_id").notNull().references(() => proposedEdits.id),
  signerId: uuid("signer_id").notNull().references(() => signers.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("proposal_upvotes_pk").on(t.proposalId, t.signerId)]);
```

### `comments` (re-introduced from closed PR #4, simplified)

```ts
export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  baseVersionId: uuid("base_version_id").notNull().references(() => versions.id),
  // A comment is anchored to either a sentence anchor OR a proposed_edit.
  // Exactly one of (anchorId, proposalId) must be non-null.
  anchorId: text("anchor_id"),
  proposalId: uuid("proposal_id").references(() => proposedEdits.id),
  signerId: uuid("signer_id").notNull().references(() => signers.id),
  body: text("body").notNull(),
  parentCommentId: uuid("parent_comment_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  hiddenReason: text("hidden_reason"),
});
```

### `endorsements`

```ts
export const endorsements = pgTable("endorsements", {
  id: uuid("id").defaultRandom().primaryKey(),
  signerId: uuid("signer_id").notNull().references(() => signers.id),
  // The base version of the working draft the user endorsed.
  baseVersionId: uuid("base_version_id").notNull().references(() => versions.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  // When the draft eventually shipped, what version it became.
  convertedToVersionId: uuid("converted_to_version_id").references(() => versions.id),
  convertedAt: timestamp("converted_at", { withTimezone: true }),
}, (t) => [uniqueIndex("endorsements_signer_base_unique").on(t.signerId, t.baseVersionId)]);
```

(`reports` table for comment/proposal moderation can be added later when abuse becomes a concern; admin can already manually hide comments via a simple SQL update for now.)

## UI flows

### Composing an edit (Current OR Proposed tab)

1. User selects text inside a sentence (a contiguous selection within one `<span data-anchor-id>` block).
2. A floating popover near the selection shows two buttons: **Comment** and **Suggest Changes**.
3. **Comment** opens a small inline composer; the user types and submits. On submit: if unauthenticated, save draft to `localStorage` and route through Clerk OTP, then submit on return.
4. **Suggest Changes** opens a sentence-level edit composer:
   - The full target sentence is pre-loaded in a textarea (for `replace`).
   - A radio above: `Replace this sentence` / `Insert a new sentence after this one` / `Delete this sentence`.
   - For `insert_after`, the textarea is empty.
   - For `delete`, the textarea is hidden.
   - A "Why this change?" rationale field below.
   - Submit creates a `proposed_edits` row in `pending`. On submit: same Clerk OTP fall-through as comments.

### Browsing on `/proposed`

1. Same article layout as the doc.
2. Sentences with `accepted` proposals are rendered with the accepted text (preview). A faint green left border + small "edited" badge marks them.
3. Sentences with `pending` proposals get a yellow underline + a count badge ("3 proposed changes"). Clicking opens a side drawer with each proposal:
   - Original text, proposed text, diff highlighted.
   - Proposer's display name + rationale.
   - Upvote count, "Upvote" button.
   - Replies thread (comments anchored to this proposal).
   - For admins: green "Accept" + red "Reject" buttons.

### Admin review queue (`/admin/proposals`)

Lists all `pending` proposals for the current `baseVersionId`. Columns: proposer, kind, target anchor, original text → proposed text, upvote count, age. Accept and Reject buttons inline. Each row links to the side-drawer view above for full discussion.

### Admin release flow (`/admin/release`)

1. Shows a summary: N accepted proposals, M pending (will go stale), K endorsers.
2. Shows a preview of the new version's text (computed by applying all accepted edits to the base).
3. Asks the admin to pick the new version string: a select with three suggested options (patch `0.0.2`, minor `0.1.0`, major `1.0.0`). Admin can override the string entirely.
4. On confirm:
   - Create a new `versions` row with the new string + the computed markdown.
   - Mark every `accepted` proposal as `published`, stamp `publishedInVersionId`.
   - Mark every `pending` proposal as `stale`.
   - Background job: for each `endorsements` row where `baseVersionId` = the released draft and `convertedAt` is null, send a "your endorsed draft just shipped — sign it?" email with a one-click signature link (which uses the existing sign action with the new version).
   - Redirect admin to `/v/[new-version]`.

## Migrations needed

1. `proposed_edits` table.
2. `proposal_upvotes` table.
3. `comments` table (re-introduce with the new polymorphic `anchor_id` / `proposal_id` shape).
4. `endorsements` table.

No changes to `signers`, `signatures`, `consent_records`, or `versions` schemas. The whole feature lives in net-new tables that join to existing ones.

## Anchor stability + comment persistence across releases

Anchor IDs (e.g. `article-1-s-3`) are emitted by the markdown parser per version. When the admin releases the next version, the release flow has two jobs:

1. **Preserve anchor IDs for unchanged sentences.** For every sentence in the new version's markdown that is byte-identical to a sentence in the base version, carry the same `{#anchor-id}` marker forward. Only newly-inserted sentences get fresh IDs.
2. **Don't migrate comments or proposals.** Both `comments` and `proposed_edits` rows are keyed on `baseVersionId`. When a new version ships, those rows stay attached to the version they were submitted against. The UI surfaces only the *current* `baseVersionId`'s rows on `/` and `/proposed`. Older comments remain in the database but are not rendered on the archive view at `/v/[old-version]` (consistent with the archive-view rule already shipped in PR #7).

This keeps the model simple. Consequence: if a user comments on Current and then a new version ships before an admin acts, that comment is effectively archived. Acceptable for v1.

## Open questions / out of scope

- **Forking** (a user signs a fork) — deferred. `versions.is_user_fork` + `versions.parent_version_id` columns are already in the schema and reserved for this.
- **Two `replace` proposals on the same anchor** — both cannot be `accepted`. Accepting one auto-rejects the other (with an admin-visible note recording the auto-rejection). Enforced in the accept action.
- **An `accepted` `insert_after` plus a `delete` of the same anchor** — also mutually exclusive: accepting a delete on an anchor auto-rejects any pending or accepted `insert_after` for that anchor (with a warning shown to the admin at accept time).
- **Suggest-Changes on a sentence that an accepted `delete` has removed** — disallowed by the UI: the highlight popover does not appear on deleted anchors on `/proposed`. Backend rejects POSTs that target a deleted anchor.
- **Zero accepted edits at release time** — disallow release. Admin gets an error: "No changes to release. Accept at least one proposal first."
- **Markdown formatting inside edits** — v1 is plain text; no bold/italic. Add later if needed.
- **Spam moderation** — soft-banned signers (existing column) can't submit comments or proposals. Rate-limit submissions per signer (e.g. 10/hour). No automated content filter v1.
- **Endorsement email throttling** — if the user endorses 5 drafts in a row, they get 5 emails when each ships. Acceptable for v1.

---

*End of design doc.*
