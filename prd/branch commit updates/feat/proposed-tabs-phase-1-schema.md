# Branch Progress: feat/proposed-tabs-phase-1-schema

## Progress Update as of 2026-05-19 10:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Tightened schema quality in `src/lib/db/schema.ts`: added a self-referential FK on `comments.parentCommentId`, renamed both upvote unique indexes to follow the `<table>_<columns>_unique` convention, and normalized `commentUpvotes` to multi-line index style. Required importing `AnyPgColumn` from `drizzle-orm/pg-core` and annotating the self-referential FK lambda to satisfy TypeScript's circular-reference inference rules. `tsc --noEmit` is clean.

### Detail of changes made:
- **`src/lib/db/schema.ts`**:
  - Added `type AnyPgColumn` to the `drizzle-orm/pg-core` import to resolve TS circular-reference error (`TS7022`/`TS7024`) introduced by the self-referential FK.
  - `comments.parentCommentId`: changed from bare `uuid("parent_comment_id")` to `uuid("parent_comment_id").references((): AnyPgColumn => comments.id)`. DB now enforces that any non-null `parent_comment_id` points to a real comment row.
  - `proposal_upvotes_pk` → `proposal_upvotes_proposal_signer_unique`: matches the `<table>_<columns>_unique` naming convention used by `versions_version_unique`, `signatures_signer_version_unique`, and `endorsements_signer_base_unique`.
  - `comment_upvotes_pk` → `comment_upvotes_comment_signer_unique`: same convention fix.
  - `commentUpvotes` index style: expanded from single-line to multi-line to match `proposalUpvotes`.
- No migration yet — these are schema-only changes; Task 1.2 will generate the migration.

### Potential concerns to address:
- The `AnyPgColumn` return type annotation on the self-referential FK lambda is the canonical Drizzle pattern for circular tables; it is type-safe but slightly non-obvious — future editors should preserve the annotation or TypeScript will error.
- Index renames will appear in the generated migration as `DROP INDEX` + `CREATE UNIQUE INDEX` — this is fine for a new branch with no existing migration yet.

---

## Progress Update as of 2026-05-19 10:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Added five new Drizzle ORM table definitions to `src/lib/db/schema.ts`: `proposedEdits`, `proposalUpvotes`, `comments`, `commentUpvotes`, and `endorsements`. This is Task 1.1 of Phase 1 (schema migrations) for the Current/Proposed Tabs feature. No migrations or UI changes yet.

### Detail of changes made:
- **`src/lib/db/schema.ts`**: Appended five `pgTable` exports after the existing `signatures` table:
  - `proposedEdits` — stores proposed text edits to a document version; references `versions.id` (as `baseVersionId` and `publishedInVersionId`) and `signers.id` (as `proposerSignerId` and `decidedBy`); has `kind` enum (`replace|insert_after|delete`) and `status` enum (`pending|accepted|rejected|stale|published`).
  - `proposalUpvotes` — join table (proposalId + signerId) with a composite `uniqueIndex("proposal_upvotes_pk")`; references `proposedEdits.id` and `signers.id`.
  - `comments` — polymorphic: either anchored to a document anchor (`anchorId: text`) or to a proposal (`proposalId` FK to `proposedEdits.id`); supports threading via nullable `parentCommentId`; has `hiddenAt`/`hiddenReason` for moderation.
  - `commentUpvotes` — join table (commentId + signerId) with a composite `uniqueIndex("comment_upvotes_pk")`; references `comments.id` and `signers.id`.
  - `endorsements` — one endorsement per (signer, baseVersion) pair enforced by `uniqueIndex("endorsements_signer_base_unique")`; tracks conversion to a new version via `convertedToVersionId` and `convertedAt`.
- `uniqueIndex` was already imported from `drizzle-orm/pg-core` — no import changes needed.
- `pnpm exec tsc --noEmit` passes cleanly.

### Potential concerns to address:
- `comments.parentCommentId` is a plain `uuid` column with no explicit FK reference back to `comments.id`. This is intentional to avoid a circular self-referential FK at the Drizzle/Neon level, but it means referential integrity for threading is enforced at the application layer only. Flag this if the migration review wants a proper self-referential FK.
- The five new tables have no migration SQL yet — that's Task 1.2.

---
