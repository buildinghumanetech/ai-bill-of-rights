# Current vs Proposed Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the AI Bill of Rights from a static signable document into a community-edited living one. Add per-sentence comments, proposed text edits, an admin review queue, a release flow with admin-picked version bump, and endorsement-to-signature conversion when a draft ships.

**Architecture:** Five new tables (`proposed_edits`, `proposal_upvotes`, `comments`, `comment_upvotes`, `endorsements`) joined to existing `signers` + `versions`. (The spec's Data Model section lists four — `comment_upvotes` is added here because the UI section calls for upvotes on comments and we need a join table for them.) UI lives at `/` (Current) and `/proposed` (working draft) with a shared highlight-popover for Comment/Suggest-Changes. Admin queue at `/admin/proposals`; release flow at `/admin/release` that mints a new `versions` row with anchor IDs preserved for unchanged sentences.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript 5 · Tailwind 4 · Drizzle ORM · Neon Postgres · Vitest + pglite for tests · Clerk for auth · Resend for email.

**Spec:** `docs/superpowers/specs/2026-05-19-current-vs-proposed-tabs-design.md`

**Phases (each ships independently):**
1. **Schema** — 4 new tables, migrations, pglite test helper updates. Zero UI; safe to merge alone.
2. **Per-sentence Comments on `/`** — highlight popover, comment composer, comment thread, anchor-level drawer. Suggest-Changes button is rendered as disabled. Live to all signed-in users.
3. **Proposed-edit composer + `/proposed` preview + `/admin/proposals` review queue** — full proposed-edit lifecycle minus release. Pending markers, admin Accept/Reject, preview rendering. Accepted edits accumulate but never ship until phase 4.
4. **Release flow + endorsement-to-signature conversion** — `/admin/release` page, Endorse button on `/proposed`, post-release email to endorsers, anchor-ID preservation when computing the new markdown.

After each phase, the engineer runs the **Phase N — Done & PR** task that runs the full test suite, smoke-tests locally, and commits a progress-log update.

---

## File structure

### Phase 1 (schema)

- **Modify** `src/lib/db/schema.ts` — add `proposedEdits`, `proposalUpvotes`, `comments`, `endorsements` tables.
- **Create** `drizzle/0005_<name>.sql` — generated migration (the next index after the rotation+notification migrations that already shipped).
- **Modify** `drizzle/meta/_journal.json` and **create** `drizzle/meta/0005_snapshot.json` — drizzle-kit produces these automatically.
- **Modify** `tests/_helpers/pglite-db.ts` — add CREATE TABLE statements for the 4 new tables that mirror the schema.
- **Create** `tests/lib/db.schema.test.ts` (if not present; if present, add cases) — smoke test that the new tables exist and can be queried.

### Phase 2 (Comments)

- **Create** `src/lib/ratelimit/enforce.ts` — DB-backed sliding-window rate limiter (reused from closed PR #4 design).
- **Modify** `src/lib/db/queries.ts` — add `countCommentsByAnchor`, `listCommentsForAnchor`, `listCommentsByVersion`.
- **Create** `src/server/actions/comments.ts` — `createCommentAction`, `hideCommentAction` (admin), `unhideCommentAction` (admin).
- **Create** `src/server/actions/upvotes.ts` — `toggleCommentUpvoteAction`.
- **Create** `src/lib/comments/draft.ts` — localStorage helpers for persisting unsubmitted drafts across the Clerk OTP redirect.
- **Create** `src/components/AnchorSentence.tsx` — wraps each sentence in a `<span data-anchor-id>` that captures `mouseup` to surface text selections.
- **Create** `src/components/HighlightPopover.tsx` — floats near a selection inside an anchor; two buttons (Comment + Suggest Changes, the latter disabled in phase 2).
- **Create** `src/components/CommentDrawer.tsx` — right-side drawer that opens when an anchor's count badge is clicked.
- **Create** `src/components/CommentComposer.tsx` — textarea form, anonymous-then-OTP if not signed in.
- **Create** `src/components/CommentThread.tsx` — recursive comment + reply list with per-comment upvote.
- **Modify** `src/components/DocumentRenderer.tsx` — add an interactive mode (`readOnly={false}`) that wraps each sentence in `AnchorSentence` and renders count badges.
- **Modify** `src/app/page.tsx` — wire up the interactive layer and the `CommentDrawer`. Fetch comment counts per anchor at SSR.
- **Modify** `tests/_helpers/pglite-db.ts` — already updated in phase 1; no new changes here.

### Phase 3 (Proposed-edit composer + admin queue)

- **Modify** `src/components/HighlightPopover.tsx` — enable the Suggest-Changes button.
- **Create** `src/components/SuggestChangesComposer.tsx` — kind radio + textarea + rationale + submit.
- **Create** `src/components/ProposalDrawer.tsx` — right-side drawer showing proposals for an anchor (replaces or extends CommentDrawer on `/proposed`).
- **Create** `src/components/ProposalCard.tsx` — single proposal: diff, upvote, replies, admin Accept/Reject buttons.
- **Create** `src/lib/proposed/apply-edits.ts` — pure function: takes a `ParsedDocument` + array of accepted edits → returns a new `ParsedDocument` with edits applied (replacements, inserts, deletes). Used for `/proposed` preview rendering only — doesn't touch the DB.
- **Modify** `src/lib/db/queries.ts` — add `listProposalsByAnchor`, `listPendingProposalsForVersion`, `getAcceptedProposalsForVersion`, `countProposalsByAnchor`.
- **Create** `src/server/actions/proposals.ts` — `submitProposalAction`, `acceptProposalAction`, `rejectProposalAction`, `toggleProposalUpvoteAction`.
- **Create** `src/app/proposed/page.tsx` — `/proposed` route, renders the doc with accepted edits applied + pending markers.
- **Create** `src/app/admin/proposals/page.tsx` — admin review queue.
- **Modify** `src/app/page.tsx` — add a small "View proposed v0.0.2 →" link in the header so users can find `/proposed`.

### Phase 4 (Release + endorsement conversion)

- **Create** `src/components/EndorseButton.tsx` — client component on `/proposed`.
- **Create** `src/server/actions/endorsements.ts` — `toggleEndorsementAction`.
- **Modify** `src/lib/db/queries.ts` — add `listEndorsersForVersion`, `getMyEndorsementForVersion`.
- **Create** `src/lib/proposed/serialize-markdown.ts` — pure function: takes an in-memory `ParsedDocument` + the set of accepted edits → emits markdown text **preserving the original `{#anchor-id}` markers** for sentences that weren't replaced/deleted. Mints fresh anchor IDs (suffix `a`, `b`, …) for inserted sentences.
- **Create** `src/app/admin/release/page.tsx` — release page with bump-tier select + preview + confirm button.
- **Create** `src/server/actions/release.ts` — `releaseVersionAction`: inserts a new `versions` row, marks accepted proposals `published`, stales pending, fires endorsement-conversion emails.
- **Modify** `src/lib/email/templates.ts` — add `releaseConversionEmail(opts)`.
- **Modify** `src/app/proposed/page.tsx` — render `EndorseButton` instead of placeholder; show endorser count.
- **Modify** `src/app/admin/page.tsx` (or wherever the admin landing lives) — add "Release new version" link.

---

## Phase 1: Schema

### Task 1.1: Add the four new tables to schema.ts

**Files:**
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Read the current schema.ts to find the right insertion point**

Run: `cat src/lib/db/schema.ts | tail -20`
Expected: file ends after the `signatures` table (or whatever's last on main); newcomers go below it.

- [ ] **Step 2: Add the four new tables at the bottom of `src/lib/db/schema.ts`**

Append to the end of the file (after existing `pgTable` declarations):

```ts
export const proposedEdits = pgTable("proposed_edits", {
  id: uuid("id").defaultRandom().primaryKey(),
  baseVersionId: uuid("base_version_id")
    .notNull()
    .references(() => versions.id),
  proposerSignerId: uuid("proposer_signer_id")
    .notNull()
    .references(() => signers.id),
  kind: text("kind", {
    enum: ["replace", "insert_after", "delete"],
  }).notNull(),
  targetAnchorId: text("target_anchor_id").notNull(),
  newText: text("new_text"),
  rationale: text("rationale"),
  status: text("status", {
    enum: ["pending", "accepted", "rejected", "stale", "published"],
  })
    .notNull()
    .default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: uuid("decided_by").references(() => signers.id),
  publishedInVersionId: uuid("published_in_version_id").references(
    () => versions.id,
  ),
});

export const proposalUpvotes = pgTable(
  "proposal_upvotes",
  {
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => proposedEdits.id),
    signerId: uuid("signer_id")
      .notNull()
      .references(() => signers.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("proposal_upvotes_pk").on(t.proposalId, t.signerId),
  ],
);

export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  baseVersionId: uuid("base_version_id")
    .notNull()
    .references(() => versions.id),
  // Polymorphic: exactly one of (anchorId, proposalId) is non-null.
  anchorId: text("anchor_id"),
  proposalId: uuid("proposal_id").references(() => proposedEdits.id),
  signerId: uuid("signer_id")
    .notNull()
    .references(() => signers.id),
  body: text("body").notNull(),
  parentCommentId: uuid("parent_comment_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
  hiddenReason: text("hidden_reason"),
});

export const commentUpvotes = pgTable(
  "comment_upvotes",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id),
    signerId: uuid("signer_id")
      .notNull()
      .references(() => signers.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("comment_upvotes_pk").on(t.commentId, t.signerId)],
);

export const endorsements = pgTable(
  "endorsements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    signerId: uuid("signer_id")
      .notNull()
      .references(() => signers.id),
    baseVersionId: uuid("base_version_id")
      .notNull()
      .references(() => versions.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    convertedToVersionId: uuid("converted_to_version_id").references(
      () => versions.id,
    ),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("endorsements_signer_base_unique").on(t.signerId, t.baseVersionId),
  ],
);
```

- [ ] **Step 3: Verify the imports at the top of the file already include `uniqueIndex`**

Run: `head -20 src/lib/db/schema.ts`
Expected: the existing import block already names `uniqueIndex`. If it doesn't, add it.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean, no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "Add proposed_edits, proposal_upvotes, comments, comment_upvotes, endorsements tables to schema"
```

### Task 1.2: Generate the SQL migration

**Files:**
- Create: `drizzle/0005_<auto-name>.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `drizzle/meta/0005_snapshot.json`

- [ ] **Step 1: Generate the migration**

Run: `pnpm drizzle-kit generate --name=add_comments_and_proposed_edits`
Expected: drizzle-kit prints `Your SQL migration file ➜ drizzle/0005_add_comments_and_proposed_edits.sql 🚀` and updates `_journal.json` + `0005_snapshot.json`.

- [ ] **Step 2: Read the generated SQL and verify it creates the five tables**

Run: `cat drizzle/0005_add_comments_and_proposed_edits.sql`
Expected: five `CREATE TABLE` statements for `proposed_edits`, `proposal_upvotes`, `comments`, `comment_upvotes`, `endorsements`, plus index DDL for the unique indexes.

- [ ] **Step 3: Push to dev Neon branch**

Run: `pnpm db:push`
Expected: drizzle-kit applies the migration. If it warns about destructive changes, abort and investigate — there should be none for this PR.

- [ ] **Step 4: Confirm tables exist on dev branch**

Write `/tmp/check_new_tables.ts`:
```ts
import { config } from "dotenv";
config({ path: ".env.local" });
async function main() {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(process.env.DATABASE_URL!);
  const rows = await sql`select table_name from information_schema.tables where table_schema='public' and table_name in ('proposed_edits','proposal_upvotes','comments','comment_upvotes','endorsements') order by table_name`;
  console.log(rows.map((r: { table_name: string }) => r.table_name));
}
main();
```
Then copy it into the project so node_modules resolves, run it, and delete it:
```bash
cp /tmp/check_new_tables.ts scripts/check-new-tables.ts
pnpm tsx scripts/check-new-tables.ts
rm scripts/check-new-tables.ts
```
Expected output: `[ 'comment_upvotes', 'comments', 'endorsements', 'proposal_upvotes', 'proposed_edits' ]`.

- [ ] **Step 5: Commit**

```bash
git add drizzle/0005_add_comments_and_proposed_edits.sql drizzle/meta/0005_snapshot.json drizzle/meta/_journal.json
git commit -m "Generate migration for comments + proposed_edits + endorsements tables"
```

### Task 1.3: Update pglite test helper

**Files:**
- Modify: `tests/_helpers/pglite-db.ts`

- [ ] **Step 1: Open `tests/_helpers/pglite-db.ts` and find the end of the `client.exec(...)` block**

Run: `grep -n "create table\|client.exec" tests/_helpers/pglite-db.ts | head -10`
Expected: shows the existing block; the helper currently creates `versions`, `signers`, `consent_records`, `signatures`. We're appending five more tables to that exec call.

- [ ] **Step 2: Append CREATE TABLE statements to the `client.exec(\`...\`)` template literal**

Insert before the closing `` ` `` of `client.exec(\`...\`)`:

```sql

    create table proposed_edits (
      id uuid primary key default gen_random_uuid(),
      base_version_id uuid not null references versions(id),
      proposer_signer_id uuid not null references signers(id),
      kind text not null check (kind in ('replace','insert_after','delete')),
      target_anchor_id text not null,
      new_text text,
      rationale text,
      status text not null default 'pending' check (status in ('pending','accepted','rejected','stale','published')),
      created_at timestamptz not null default now(),
      decided_at timestamptz,
      decided_by uuid references signers(id),
      published_in_version_id uuid references versions(id)
    );

    create table proposal_upvotes (
      proposal_id uuid not null references proposed_edits(id),
      signer_id uuid not null references signers(id),
      created_at timestamptz not null default now(),
      primary key (proposal_id, signer_id)
    );

    create table comments (
      id uuid primary key default gen_random_uuid(),
      base_version_id uuid not null references versions(id),
      anchor_id text,
      proposal_id uuid references proposed_edits(id),
      signer_id uuid not null references signers(id),
      body text not null,
      parent_comment_id uuid,
      created_at timestamptz not null default now(),
      hidden_at timestamptz,
      hidden_reason text
    );

    create table comment_upvotes (
      comment_id uuid not null references comments(id),
      signer_id uuid not null references signers(id),
      created_at timestamptz not null default now(),
      primary key (comment_id, signer_id)
    );

    create table endorsements (
      id uuid primary key default gen_random_uuid(),
      signer_id uuid not null references signers(id),
      base_version_id uuid not null references versions(id),
      created_at timestamptz not null default now(),
      converted_to_version_id uuid references versions(id),
      converted_at timestamptz
    );
    create unique index endorsements_signer_base_unique on endorsements (signer_id, base_version_id);
```

- [ ] **Step 3: Run existing tests to confirm the helper still works**

Run: `pnpm test`
Expected: all existing tests still pass; no new failures from the appended DDL.

- [ ] **Step 4: Commit**

```bash
git add tests/_helpers/pglite-db.ts
git commit -m "Mirror new tables in pglite test helper"
```

### Task 1.4: Smoke-test the new tables in pglite

**Files:**
- Create: `tests/lib/db.proposed-edits-schema.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/db.proposed-edits-schema.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import {
  comments,
  commentUpvotes,
  endorsements,
  proposalUpvotes,
  proposedEdits,
  signers,
  versions,
} from "@/lib/db/schema";
import { syncVersions } from "@/lib/db/sync";

const sampleMarkdown = `---
version: 1.0.0
published_at: 2026-05-18
---

# T {#preamble}
x {#preamble-s-1}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [
    {
      version: "1.0.0",
      publishedAt: new Date("2026-05-18T00:00:00Z"),
      markdown: sampleMarkdown,
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: true,
      gitCommitSha: null,
    },
  ]);
  const [v] = await db.select().from(versions);
  const [s] = await db
    .insert(signers)
    .values({
      clerkUserId: "u1",
      displayName: "Test Signer",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return { db, versionId: v.id, signerId: s.id };
}

describe("proposed_edits + adjacent tables schema", () => {
  it("inserts a proposed_edit and upvote and reads them back", async () => {
    const { db, versionId, signerId } = await seed();
    const [p] = await db
      .insert(proposedEdits)
      .values({
        baseVersionId: versionId,
        proposerSignerId: signerId,
        kind: "replace",
        targetAnchorId: "preamble-s-1",
        newText: "y",
        rationale: "shorter",
      })
      .returning({ id: proposedEdits.id, status: proposedEdits.status });
    expect(p.status).toBe("pending");

    await db
      .insert(proposalUpvotes)
      .values({ proposalId: p.id, signerId });
    const upvotes = await db.select().from(proposalUpvotes);
    expect(upvotes).toHaveLength(1);
  });

  it("inserts a comment anchored to a sentence + an upvote + reads them", async () => {
    const { db, versionId, signerId } = await seed();
    const [c] = await db
      .insert(comments)
      .values({
        baseVersionId: versionId,
        anchorId: "preamble-s-1",
        signerId,
        body: "interesting",
      })
      .returning({ id: comments.id });
    await db
      .insert(commentUpvotes)
      .values({ commentId: c.id, signerId });
    const upvotes = await db.select().from(commentUpvotes);
    expect(upvotes).toHaveLength(1);
  });

  it("inserts an endorsement and round-trips it", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(endorsements).values({ signerId, baseVersionId: versionId });
    const rows = await db.select().from(endorsements);
    expect(rows).toHaveLength(1);
    expect(rows[0].convertedToVersionId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/lib/db.proposed-edits-schema.test.ts`
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add tests/lib/db.proposed-edits-schema.test.ts
git commit -m "Smoke-test new schema tables in pglite"
```

### Task 1.5: Phase 1 — Done & PR

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all pass.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Add a progress-log entry**

If the branch is named `feat/proposed-tabs-phase-1-schema`, ensure `prd/branch commit updates/feat/proposed-tabs-phase-1-schema.md` exists; create it if not.

Prepend a new entry to the top following the project's progress-log format (see `CLAUDE.md`):

```markdown
## Progress Update as of [YYYY-MM-DD HH:MM Pacific]
*(Most recent updates at top)*

### Summary of changes since last update
First entry. Phase 1 of the Current vs Proposed tabs spec: schema migrations for proposed_edits, proposal_upvotes, comments, comment_upvotes, endorsements. No UI; safe to merge alone.

### Detail of changes made:
- `src/lib/db/schema.ts`: added 5 new tables. Comments are polymorphic (anchor_id OR proposal_id). Endorsements track baseVersionId → convertedToVersionId for the post-release email flow.
- `drizzle/0005_add_comments_and_proposed_edits.sql`: generated migration. Already pushed to the dev Neon branch.
- `tests/_helpers/pglite-db.ts`: mirrors the new tables for in-memory pglite tests.
- `tests/lib/db.proposed-edits-schema.test.ts`: smoke test that the tables accept inserts.

### Potential concerns to address:
- The polymorphic comments shape (anchor_id XOR proposal_id) is not DB-enforced; we'll guard in the server action. Acceptable for v1.

---
```

Run: `git add "prd/branch commit updates/feat/proposed-tabs-phase-1-schema.md"`

- [ ] **Step 4: Push the branch and open a PR**

```bash
git push -u origin HEAD
gh pr create --title "Phase 1: schema for proposed-edits + comments + endorsements" --body "Implements phase 1 of \`docs/superpowers/specs/2026-05-19-current-vs-proposed-tabs-design.md\`. Schema only — no UI changes. Safe to merge alone."
```

---

## Phase 2: Per-sentence Comments on `/`

> Requires phase 1 to be merged (or at least on the branch as a baseline).

### Task 2.1: Add the DB-backed rate limiter

**Files:**
- Create: `src/lib/ratelimit/enforce.ts`
- Create: `tests/lib/ratelimit.enforce.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/ratelimit.enforce.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { signers, comments, versions } from "@/lib/db/schema";
import { syncVersions } from "@/lib/db/sync";
import { enforceRateLimit } from "@/lib/ratelimit/enforce";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [
    {
      version: "1.0.0",
      publishedAt: new Date(),
      markdown: md,
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: true,
      gitCommitSha: null,
    },
  ]);
  const [v] = await db.select().from(versions);
  const [s] = await db
    .insert(signers)
    .values({
      clerkUserId: "u1",
      displayName: "X",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return { db, versionId: v.id, signerId: s.id };
}

describe("enforceRateLimit", () => {
  it("allows up to N writes per window then throws", async () => {
    const { db, versionId, signerId } = await seed();
    // Pretend the rate-limited operation is inserting a comment.
    const op = async () => {
      await db.insert(comments).values({
        baseVersionId: versionId,
        anchorId: "preamble-s-1",
        signerId,
        body: "x",
      });
    };

    // 5 writes inside the window: all succeed.
    for (let i = 0; i < 5; i++) {
      await enforceRateLimit(db, {
        bucket: "comment",
        signerId,
        windowSec: 3600,
        max: 5,
        countSql: `SELECT count(*)::int as n FROM comments WHERE signer_id = $1 AND created_at > now() - interval '1 hour'`,
      });
      await op();
    }

    // 6th throws.
    await expect(
      enforceRateLimit(db, {
        bucket: "comment",
        signerId,
        windowSec: 3600,
        max: 5,
        countSql: `SELECT count(*)::int as n FROM comments WHERE signer_id = $1 AND created_at > now() - interval '1 hour'`,
      }),
    ).rejects.toThrow(/rate/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/ratelimit.enforce.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/ratelimit/enforce.ts`**

```ts
// src/lib/ratelimit/enforce.ts
import { sql } from "drizzle-orm";

interface EnforceOpts {
  bucket: string;
  signerId: string;
  windowSec: number;
  max: number;
  /**
   * A SQL count statement returning a single column `n` (integer). Use `$1`
   * for the signer id. The window is enforced inside this query — keep
   * `countSql` aligned with `windowSec`.
   */
  countSql: string;
}

export async function enforceRateLimit(
  db: any,
  opts: EnforceOpts,
): Promise<void> {
  const result = await db.execute(
    sql.raw(opts.countSql.replace("$1", `'${opts.signerId.replace(/'/g, "''")}'`)),
  );
  const rows = (result.rows ?? result) as Array<{ n: number }>;
  const n = Number(rows[0]?.n ?? 0);
  if (n >= opts.max) {
    throw new Error(
      `Rate limit exceeded for ${opts.bucket}: ${n}/${opts.max} in last ${opts.windowSec}s.`,
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/lib/ratelimit.enforce.test.ts`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ratelimit/enforce.ts tests/lib/ratelimit.enforce.test.ts
git commit -m "Add DB-backed sliding-window rate limiter"
```

### Task 2.2: Add comment queries to db/queries.ts

**Files:**
- Modify: `src/lib/db/queries.ts`
- Create: `tests/lib/db.queries.comments.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/lib/db.queries.comments.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { comments, signers, versions } from "@/lib/db/schema";
import {
  countCommentsByAnchor,
  listCommentsForAnchor,
} from "@/lib/db/queries";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1}
y {#preamble-s-2}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [
    {
      version: "1.0.0",
      publishedAt: new Date(),
      markdown: md,
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: true,
      gitCommitSha: null,
    },
  ]);
  const [v] = await db.select().from(versions);
  const [s] = await db
    .insert(signers)
    .values({
      clerkUserId: "u1",
      displayName: "X",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return { db, versionId: v.id, signerId: s.id };
}

describe("countCommentsByAnchor", () => {
  it("returns a map of anchorId -> count of visible comments", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(comments).values([
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId, body: "a" },
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId, body: "b" },
      { baseVersionId: versionId, anchorId: "preamble-s-2", signerId, body: "c" },
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId, body: "d", hiddenAt: new Date() },
    ]);
    const counts = await countCommentsByAnchor(db, versionId);
    expect(counts).toEqual({
      "preamble-s-1": 2,
      "preamble-s-2": 1,
    });
  });
});

describe("listCommentsForAnchor", () => {
  it("returns visible comments for a specific anchor, joined with display name, newest last", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(comments).values([
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId, body: "first" },
      { baseVersionId: versionId, anchorId: "preamble-s-1", signerId, body: "second" },
      { baseVersionId: versionId, anchorId: "preamble-s-2", signerId, body: "other" },
    ]);
    const rows = await listCommentsForAnchor(db, versionId, "preamble-s-1");
    expect(rows).toHaveLength(2);
    expect(rows[0].body).toBe("first");
    expect(rows[1].body).toBe("second");
    expect(rows[0].displayName).toBe("X");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run tests/lib/db.queries.comments.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 3: Add the queries to `src/lib/db/queries.ts`**

Append to the file (and add `comments`, `signers` to the imports if not already there):

```ts
import { and, asc, eq, isNull } from "drizzle-orm";
import { comments, signers } from "./schema";

export interface CommentRow {
  id: string;
  body: string;
  signerId: string;
  displayName: string;
  parentCommentId: string | null;
  createdAt: Date;
}

export async function countCommentsByAnchor(
  db: any,
  baseVersionId: string,
): Promise<Record<string, number>> {
  const rows = await db
    .select({
      anchorId: comments.anchorId,
    })
    .from(comments)
    .where(
      and(
        eq(comments.baseVersionId, baseVersionId),
        isNull(comments.hiddenAt),
      ),
    );
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!r.anchorId) continue;
    out[r.anchorId] = (out[r.anchorId] ?? 0) + 1;
  }
  return out;
}

export async function listCommentsForAnchor(
  db: any,
  baseVersionId: string,
  anchorId: string,
): Promise<CommentRow[]> {
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      signerId: comments.signerId,
      displayName: signers.displayName,
      parentCommentId: comments.parentCommentId,
      createdAt: comments.createdAt,
    })
    .from(comments)
    .innerJoin(signers, eq(signers.id, comments.signerId))
    .where(
      and(
        eq(comments.baseVersionId, baseVersionId),
        eq(comments.anchorId, anchorId),
        isNull(comments.hiddenAt),
      ),
    )
    .orderBy(asc(comments.createdAt));
  return rows as CommentRow[];
}
```

(Note: if `and`, `asc`, `eq`, `isNull` are already imported at the top of queries.ts, don't double-import — just confirm they are there.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run tests/lib/db.queries.comments.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries.ts tests/lib/db.queries.comments.test.ts
git commit -m "Add countCommentsByAnchor + listCommentsForAnchor queries"
```

### Task 2.3: Add the comment server action

**Files:**
- Create: `src/server/actions/comments.ts`
- Create: `tests/server/comments.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/comments.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { comments, signers, versions } from "@/lib/db/schema";
import { createComment } from "@/server/actions/comments";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [
    {
      version: "1.0.0",
      publishedAt: new Date(),
      markdown: md,
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: true,
      gitCommitSha: null,
    },
  ]);
  const [v] = await db.select().from(versions);
  const [s] = await db
    .insert(signers)
    .values({
      clerkUserId: "u1",
      displayName: "X",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return { db, versionId: v.id, signerId: s.id };
}

describe("createComment (data layer)", () => {
  it("inserts a comment row anchored to a sentence", async () => {
    const { db, versionId, signerId } = await seed();
    const c = await createComment(db, {
      baseVersionId: versionId,
      signerId,
      anchorId: "preamble-s-1",
      body: "  hello world  ",
    });
    expect(c.id).toBeDefined();
    const rows = await db.select().from(comments);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("hello world"); // trimmed
  });

  it("rejects empty bodies", async () => {
    const { db, versionId, signerId } = await seed();
    await expect(
      createComment(db, {
        baseVersionId: versionId,
        signerId,
        anchorId: "preamble-s-1",
        body: "   ",
      }),
    ).rejects.toThrow(/empty/i);
  });

  it("requires exactly one of anchorId or proposalId", async () => {
    const { db, versionId, signerId } = await seed();
    await expect(
      createComment(db, {
        baseVersionId: versionId,
        signerId,
        body: "x",
      } as any),
    ).rejects.toThrow(/anchor.*or.*proposal/i);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL (no module)**

Run: `pnpm exec vitest run tests/server/comments.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/server/actions/comments.ts`**

```ts
// src/server/actions/comments.ts
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { comments, signers } from "@/lib/db/schema";
import { enforceRateLimit } from "@/lib/ratelimit/enforce";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

export interface CreateCommentInput {
  baseVersionId: string;
  signerId: string;
  anchorId?: string;
  proposalId?: string;
  parentCommentId?: string;
  body: string;
}

/**
 * Data-layer insert. Trims the body, validates that exactly one of
 * (anchorId, proposalId) is set, and rejects empties.
 *
 * The action wrapper below does auth + rate-limit + soft-ban checks.
 */
export async function createComment(
  db: any,
  input: CreateCommentInput,
): Promise<{ id: string }> {
  const body = input.body.trim();
  if (!body) throw new Error("Comment body cannot be empty.");
  const hasAnchor = Boolean(input.anchorId);
  const hasProposal = Boolean(input.proposalId);
  if (hasAnchor === hasProposal) {
    throw new Error("Comment must target exactly one of anchorId or proposalId.");
  }
  const [row] = await db
    .insert(comments)
    .values({
      baseVersionId: input.baseVersionId,
      signerId: input.signerId,
      anchorId: input.anchorId ?? null,
      proposalId: input.proposalId ?? null,
      parentCommentId: input.parentCommentId ?? null,
      body,
    })
    .returning({ id: comments.id });
  return { id: row.id };
}

export async function submitCommentAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const db = getDb();
  const me = await db
    .select({ id: signers.id, softBannedAt: signers.softBannedAt })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (me.length === 0) return { ok: false, error: "Sign first to comment." };
  if (me[0].softBannedAt) {
    return { ok: false, error: "This account is suspended pending moderator review." };
  }

  const baseVersionId = String(formData.get("baseVersionId") ?? "");
  const anchorId = formData.get("anchorId")?.toString() || undefined;
  const proposalId = formData.get("proposalId")?.toString() || undefined;
  const parentCommentId = formData.get("parentCommentId")?.toString() || undefined;
  const body = String(formData.get("body") ?? "");

  try {
    await enforceRateLimit(db, {
      bucket: "comment",
      signerId: me[0].id,
      windowSec: 3600,
      max: 20,
      countSql: `SELECT count(*)::int as n FROM comments WHERE signer_id = $1 AND created_at > now() - interval '1 hour'`,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  try {
    await createComment(db, {
      baseVersionId,
      signerId: me[0].id,
      anchorId,
      proposalId,
      parentCommentId,
      body,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  revalidatePath("/");
  return { ok: true };
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `pnpm exec vitest run tests/server/comments.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/comments.ts tests/server/comments.test.ts
git commit -m "Add createComment + submitCommentAction (rate-limited, soft-ban aware)"
```

### Task 2.4: Add the upvote action

**Files:**
- Create: `src/server/actions/upvotes.ts`
- Create: `tests/server/upvotes.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/upvotes.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import {
  commentUpvotes,
  comments,
  signers,
  versions,
} from "@/lib/db/schema";
import { toggleCommentUpvote } from "@/server/actions/upvotes";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [
    {
      version: "1.0.0",
      publishedAt: new Date(),
      markdown: md,
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: true,
      gitCommitSha: null,
    },
  ]);
  const [v] = await db.select().from(versions);
  const [s] = await db
    .insert(signers)
    .values({
      clerkUserId: "u1",
      displayName: "X",
      affiliation: null,
      locationText: null,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  const [c] = await db
    .insert(comments)
    .values({
      baseVersionId: v.id,
      anchorId: "preamble-s-1",
      signerId: s.id,
      body: "x",
    })
    .returning({ id: comments.id });
  return { db, commentId: c.id, signerId: s.id };
}

describe("toggleCommentUpvote", () => {
  it("inserts an upvote when none exists", async () => {
    const { db, commentId, signerId } = await seed();
    const result = await toggleCommentUpvote(db, { commentId, signerId });
    expect(result.state).toBe("upvoted");
    const rows = await db.select().from(commentUpvotes);
    expect(rows).toHaveLength(1);
  });
  it("removes the upvote on the second call", async () => {
    const { db, commentId, signerId } = await seed();
    await toggleCommentUpvote(db, { commentId, signerId });
    const result = await toggleCommentUpvote(db, { commentId, signerId });
    expect(result.state).toBe("removed");
    const rows = await db.select().from(commentUpvotes);
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm exec vitest run tests/server/upvotes.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/server/actions/upvotes.ts`**

```ts
// src/server/actions/upvotes.ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { commentUpvotes, signers } from "@/lib/db/schema";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

export async function toggleCommentUpvote(
  db: any,
  input: { commentId: string; signerId: string },
): Promise<{ state: "upvoted" | "removed" }> {
  const existing = await db
    .select()
    .from(commentUpvotes)
    .where(
      and(
        eq(commentUpvotes.commentId, input.commentId),
        eq(commentUpvotes.signerId, input.signerId),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .delete(commentUpvotes)
      .where(
        and(
          eq(commentUpvotes.commentId, input.commentId),
          eq(commentUpvotes.signerId, input.signerId),
        ),
      );
    return { state: "removed" };
  }
  await db
    .insert(commentUpvotes)
    .values({ commentId: input.commentId, signerId: input.signerId });
  return { state: "upvoted" };
}

export async function toggleCommentUpvoteAction(commentId: string): Promise<{ ok: boolean; error?: string; state?: "upvoted" | "removed" }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const db = getDb();
  const me = await db
    .select({ id: signers.id, softBannedAt: signers.softBannedAt })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (me.length === 0) return { ok: false, error: "Sign first to upvote." };
  if (me[0].softBannedAt) return { ok: false, error: "This account is suspended pending moderator review." };
  const result = await toggleCommentUpvote(db, { commentId, signerId: me[0].id });
  revalidatePath("/");
  return { ok: true, state: result.state };
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `pnpm exec vitest run tests/server/upvotes.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/upvotes.ts tests/server/upvotes.test.ts
git commit -m "Add toggleCommentUpvote action"
```

### Task 2.5: Add localStorage draft helper

**Files:**
- Create: `src/lib/comments/draft.ts`

- [ ] **Step 1: Write the source (no tests — this is browser-only state)**

```ts
// src/lib/comments/draft.ts
//
// Persist a user's unsubmitted Comment / Suggest-Changes draft across the
// Clerk OTP redirect so anonymous → authenticated flows don't lose typing.
// The shape is intentionally permissive so the same helper handles both
// comments and proposed edits in phase 3.

const KEY = "abor-draft-v1";

export interface DraftPayload {
  kind: "comment" | "proposal";
  baseVersionId: string;
  anchorId?: string;
  proposalId?: string;
  parentCommentId?: string;
  // Proposal-specific fields. Ignored for comments.
  proposalKind?: "replace" | "insert_after" | "delete";
  rationale?: string;
  // Common.
  body: string;
  // Where to scroll back to on return.
  returnTo: string;
  ts: number;
}

export function saveDraft(d: DraftPayload): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...d, ts: Date.now() }));
  } catch {
    /* private mode */
  }
}

export function loadDraft(): DraftPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftPayload;
    // Expire stale drafts > 30 min old.
    if (Date.now() - parsed.ts > 30 * 60 * 1000) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* */
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/comments/draft.ts
git commit -m "Add localStorage draft helper for comments + proposals"
```

### Task 2.6: AnchorSentence component

**Files:**
- Create: `src/components/AnchorSentence.tsx`

- [ ] **Step 1: Write the source**

```tsx
// src/components/AnchorSentence.tsx
"use client";

import type { ReactNode } from "react";

interface Props {
  anchorId: string;
  count: number;
  children: ReactNode;
}

/**
 * Wraps a single sentence inside an article. Exposes the anchorId via
 * `data-anchor-id`. The container's `mouseup` listener (defined on the
 * parent DocumentRenderer) reads the current selection and decides whether
 * to open the HighlightPopover. The small count badge becomes visible on
 * hover and opens the CommentDrawer when clicked.
 */
export function AnchorSentence({ anchorId, count, children }: Props) {
  return (
    <span data-anchor-id={anchorId} className="group relative">
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent("anchor-open-comments", {
              detail: { anchorId },
            }),
          );
        }}
        className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 align-middle text-[10px] font-medium text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-200"
        aria-label={`Discuss this sentence (${count} comment${count === 1 ? "" : "s"})`}
      >
        {count > 0 ? `💬 ${count}` : "+"}
      </button>
    </span>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/AnchorSentence.tsx
git commit -m "Add AnchorSentence wrapper with hover-reveal count badge"
```

### Task 2.7: HighlightPopover component (Suggest-Changes button disabled in phase 2)

**Files:**
- Create: `src/components/HighlightPopover.tsx`

- [ ] **Step 1: Write the source**

```tsx
// src/components/HighlightPopover.tsx
"use client";

import { useEffect, useState } from "react";

interface OpenDetail {
  anchorId: string;
  selectedText: string;
  rect: { top: number; left: number; width: number; height: number };
}

interface Props {
  /**
   * When false (phase 2 default), the "Suggest Changes" button is rendered
   * disabled with a tooltip. Phase 3 flips this to true.
   */
  enableSuggestChanges?: boolean;
}

/**
 * Listens for `selection-in-anchor` window events emitted by DocumentRenderer
 * when the user selects text inside an anchored sentence. Positions a small
 * popover near the selection with Comment / Suggest Changes buttons.
 */
export function HighlightPopover({
  enableSuggestChanges = false,
}: Props) {
  const [open, setOpen] = useState<OpenDetail | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<OpenDetail>).detail;
      setOpen(detail);
    };
    const onClose = () => setOpen(null);
    window.addEventListener("selection-in-anchor", onOpen);
    window.addEventListener("mousedown", onClose);
    return () => {
      window.removeEventListener("selection-in-anchor", onOpen);
      window.removeEventListener("mousedown", onClose);
    };
  }, []);

  if (!open) return null;

  // Position above the selection.
  const top = open.rect.top + window.scrollY - 44;
  const left =
    open.rect.left + window.scrollX + open.rect.width / 2 - 90;

  return (
    <div
      style={{ top, left }}
      className="absolute z-50 flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-1.5 py-1 shadow-lg"
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent("compose-comment", { detail: open }),
          );
          setOpen(null);
        }}
        className="rounded-full px-3 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-100"
      >
        💬 Comment
      </button>
      <button
        type="button"
        disabled={!enableSuggestChanges}
        onClick={() => {
          if (!enableSuggestChanges) return;
          window.dispatchEvent(
            new CustomEvent("compose-suggest", { detail: open }),
          );
          setOpen(null);
        }}
        className={`rounded-full px-3 py-1 text-xs font-medium ${
          enableSuggestChanges
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "cursor-not-allowed bg-zinc-100 text-zinc-400"
        }`}
        title={
          enableSuggestChanges
            ? "Propose a sentence-level edit"
            : "Coming soon"
        }
      >
        ✏️ Suggest Changes
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/HighlightPopover.tsx
git commit -m "Add HighlightPopover with Comment + (disabled) Suggest Changes"
```

### Task 2.8: CommentComposer component

**Files:**
- Create: `src/components/CommentComposer.tsx`

- [ ] **Step 1: Write the source**

```tsx
// src/components/CommentComposer.tsx
"use client";

import { FormEvent, useState, useTransition } from "react";
import { useAuth, useSignUp } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { submitCommentAction } from "@/server/actions/comments";
import { saveDraft, clearDraft } from "@/lib/comments/draft";

interface Props {
  baseVersionId: string;
  anchorId?: string;
  proposalId?: string;
  parentCommentId?: string;
  defaultBody?: string;
  onSubmitted?: () => void;
  onCancel?: () => void;
}

export function CommentComposer(props: Props) {
  const [body, setBody] = useState(props.defaultBody ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { isSignedIn } = useAuth();
  const { signUp } = useSignUp();
  const router = useRouter();

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = body.trim();
    if (!trimmed) {
      setError("Comment can't be empty.");
      return;
    }

    if (!isSignedIn) {
      saveDraft({
        kind: "comment",
        baseVersionId: props.baseVersionId,
        anchorId: props.anchorId,
        proposalId: props.proposalId,
        parentCommentId: props.parentCommentId,
        body: trimmed,
        returnTo: window.location.pathname + "?draft=1",
        ts: Date.now(),
      });
      // Trigger Clerk OTP flow by opening the sign modal.
      window.dispatchEvent(new CustomEvent("open-sign-modal"));
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("baseVersionId", props.baseVersionId);
      if (props.anchorId) fd.set("anchorId", props.anchorId);
      if (props.proposalId) fd.set("proposalId", props.proposalId);
      if (props.parentCommentId) fd.set("parentCommentId", props.parentCommentId);
      fd.set("body", trimmed);
      const res = await submitCommentAction(fd);
      if (!res.ok) {
        setError(res.error ?? "Couldn't save your comment.");
        return;
      }
      clearDraft();
      setBody("");
      router.refresh();
      props.onSubmitted?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Add a comment…"
        className="w-full resize-none rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
      {error ? (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        {props.onCancel ? (
          <button
            type="button"
            onClick={props.onCancel}
            className="rounded-full px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-zinc-900 px-4 py-1 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
        >
          {pending ? "Saving…" : isSignedIn ? "Post" : "Sign in & post"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean. (The `useSignUp` import is unused on phase 2; suppress the lint warning by removing if you prefer, but it's harmless because of the underscore convention in tsconfig.)

- [ ] **Step 3: Commit**

```bash
git add src/components/CommentComposer.tsx
git commit -m "Add CommentComposer with anonymous-then-OTP draft handoff"
```

### Task 2.9: CommentThread component

**Files:**
- Create: `src/components/CommentThread.tsx`

- [ ] **Step 1: Write the source**

```tsx
// src/components/CommentThread.tsx
"use client";

import { useState } from "react";
import type { CommentRow } from "@/lib/db/queries";
import { CommentComposer } from "./CommentComposer";
import { toggleCommentUpvoteAction } from "@/server/actions/upvotes";
import { useRouter } from "next/navigation";

interface Props {
  comments: CommentRow[];
  baseVersionId: string;
  anchorId?: string;
  proposalId?: string;
}

export function CommentThread({
  comments,
  baseVersionId,
  anchorId,
  proposalId,
}: Props) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const router = useRouter();

  // Build a parent → children map; surface top-level first, then nested.
  const childrenByParent = new Map<string | null, CommentRow[]>();
  for (const c of comments) {
    const key = c.parentCommentId ?? null;
    const arr = childrenByParent.get(key) ?? [];
    arr.push(c);
    childrenByParent.set(key, arr);
  }
  const topLevel = childrenByParent.get(null) ?? [];

  async function handleUpvote(commentId: string) {
    await toggleCommentUpvoteAction(commentId);
    router.refresh();
  }

  function renderComment(c: CommentRow, depth: number): React.ReactNode {
    const children = childrenByParent.get(c.id) ?? [];
    return (
      <div
        key={c.id}
        style={{ marginLeft: depth * 16 }}
        className="border-l-2 border-zinc-100 pl-3"
      >
        <p className="text-xs font-medium text-zinc-900">{c.displayName}</p>
        <p className="text-sm text-zinc-800">{c.body}</p>
        <div className="mt-1 flex gap-3 text-xs text-zinc-500">
          <button
            type="button"
            onClick={() => handleUpvote(c.id)}
            className="hover:text-zinc-900"
          >
            👍 Upvote
          </button>
          {depth < 1 ? (
            <button
              type="button"
              onClick={() =>
                setReplyingTo(replyingTo === c.id ? null : c.id)
              }
              className="hover:text-zinc-900"
            >
              {replyingTo === c.id ? "Cancel reply" : "Reply"}
            </button>
          ) : null}
        </div>
        {replyingTo === c.id ? (
          <div className="mt-2">
            <CommentComposer
              baseVersionId={baseVersionId}
              anchorId={anchorId}
              proposalId={proposalId}
              parentCommentId={c.id}
              onSubmitted={() => setReplyingTo(null)}
              onCancel={() => setReplyingTo(null)}
            />
          </div>
        ) : null}
        {children.map((cc) => renderComment(cc, depth + 1))}
      </div>
    );
  }

  if (topLevel.length === 0) {
    return <p className="text-sm text-zinc-500">No comments yet.</p>;
  }

  return <div className="flex flex-col gap-3">{topLevel.map((c) => renderComment(c, 0))}</div>;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/CommentThread.tsx
git commit -m "Add CommentThread with one-level reply nesting + upvote"
```

### Task 2.10: CommentDrawer component

**Files:**
- Create: `src/components/CommentDrawer.tsx`

- [ ] **Step 1: Write the source**

```tsx
// src/components/CommentDrawer.tsx
"use client";

import { useEffect, useState } from "react";
import type { CommentRow } from "@/lib/db/queries";
import { CommentComposer } from "./CommentComposer";
import { CommentThread } from "./CommentThread";

interface OpenDetail {
  anchorId: string;
}

interface Props {
  baseVersionId: string;
  /**
   * Pre-fetched at SSR time: map of anchorId -> visible comments for that anchor.
   * Avoids a per-anchor round-trip when the drawer opens.
   */
  commentsByAnchor: Record<string, CommentRow[]>;
}

export function CommentDrawer({ baseVersionId, commentsByAnchor }: Props) {
  const [openAnchor, setOpenAnchor] = useState<string | null>(null);
  const [composeAnchor, setComposeAnchor] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<OpenDetail>).detail;
      setOpenAnchor(d.anchorId);
      setComposeAnchor(null);
    };
    const onCompose = (e: Event) => {
      const d = (e as CustomEvent<{ anchorId: string }>).detail;
      setOpenAnchor(d.anchorId);
      setComposeAnchor(d.anchorId);
    };
    window.addEventListener("anchor-open-comments", onOpen);
    window.addEventListener("compose-comment", onCompose);
    return () => {
      window.removeEventListener("anchor-open-comments", onOpen);
      window.removeEventListener("compose-comment", onCompose);
    };
  }, []);

  if (!openAnchor) return null;
  const list = commentsByAnchor[openAnchor] ?? [];

  return (
    <aside className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl sm:w-96">
      <header className="flex items-center justify-between border-b border-zinc-200 p-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">Discussion</p>
          <p className="text-sm font-mono text-zinc-700">{openAnchor}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpenAnchor(null)}
          className="rounded-full px-3 py-1 text-sm hover:bg-zinc-100"
        >
          Close
        </button>
      </header>
      <div className="flex-1 overflow-auto p-4">
        <CommentThread
          comments={list}
          baseVersionId={baseVersionId}
          anchorId={openAnchor}
        />
      </div>
      <footer className="border-t border-zinc-200 p-4">
        {composeAnchor === openAnchor ? (
          <CommentComposer
            baseVersionId={baseVersionId}
            anchorId={openAnchor}
            onSubmitted={() => setComposeAnchor(null)}
            onCancel={() => setComposeAnchor(null)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setComposeAnchor(openAnchor)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Add a comment
          </button>
        )}
      </footer>
    </aside>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/CommentDrawer.tsx
git commit -m "Add CommentDrawer (right-side panel) for per-anchor discussion"
```

### Task 2.11: Wire selection capture into DocumentRenderer

**Files:**
- Modify: `src/components/DocumentRenderer.tsx`

- [ ] **Step 1: Read the current DocumentRenderer**

Run: `cat src/components/DocumentRenderer.tsx`
Expected: file has a `readOnly?: boolean` prop and renders article cards in readOnly mode, plain `prose` style otherwise. The non-readOnly path currently does NOT use AnchorSentence — it just uses `<span data-anchor-id>`.

- [ ] **Step 2: Update the non-readOnly path to use AnchorSentence + emit selection events**

Replace the non-readOnly branch with:

```tsx
import { AnchorSentence } from "./AnchorSentence";
import { useEffect, useRef } from "react";

// Inside the non-readOnly branch, use AnchorSentence and add a global
// onMouseUp listener that detects selections inside any data-anchor-id span
// and dispatches selection-in-anchor with the bounding rect.

// For the JSX inside non-readOnly:
return (
  <InteractiveDoc document={document} anchorCounts={anchorCounts} />
);
```

And add the InteractiveDoc subcomponent (still inside DocumentRenderer.tsx):

```tsx
"use client";

function InteractiveDoc({
  document,
  anchorCounts,
}: {
  document: ParsedDocument;
  anchorCounts: Record<string, number>;
}) {
  const containerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (!text) return;
      // Find which anchor span contains the selection.
      let node: Node | null = sel.anchorNode;
      while (node && node.nodeType !== 1) node = node.parentNode;
      let anchorId: string | null = null;
      let cursor = node as HTMLElement | null;
      while (cursor) {
        const id = cursor.getAttribute?.("data-anchor-id");
        if (id) {
          anchorId = id;
          break;
        }
        cursor = cursor.parentElement;
      }
      if (!anchorId) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent("selection-in-anchor", {
          detail: {
            anchorId,
            selectedText: text,
            rect: {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            },
          },
        }),
      );
    }
    el.addEventListener("mouseup", onMouseUp);
    return () => el.removeEventListener("mouseup", onMouseUp);
  }, []);

  return (
    <article ref={containerRef} className="prose prose-zinc max-w-none">
      {document.articles.map((article) => (
        <section key={article.id} id={article.id}>
          {article.id === "preamble" ? (
            <h1>{article.title}</h1>
          ) : (
            <h2>{article.title}</h2>
          )}
          {article.paragraphs.map((paragraph) => (
            <p key={paragraph.id}>
              {paragraph.sentences.map((sentence, idx) => (
                <AnchorSentence
                  key={sentence.id}
                  anchorId={sentence.id}
                  count={anchorCounts[sentence.id] ?? 0}
                >
                  {idx > 0 ? " " : ""}
                  {sentence.text}
                </AnchorSentence>
              ))}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
```

(Note: since `InteractiveDoc` uses `useEffect` and `useRef`, the file as a whole needs `"use client"` at the top, OR you can split InteractiveDoc into its own file. Splitting is cleaner; create `src/components/InteractiveDoc.tsx` and import it.)

- [ ] **Step 3: Split InteractiveDoc into its own file**

Create `src/components/InteractiveDoc.tsx` with the InteractiveDoc body above (with `"use client";` at the top). Update DocumentRenderer to:

```tsx
// At the top of DocumentRenderer.tsx (still a server component):
import type { ParsedDocument } from "@/lib/markdown/parse";
import { InteractiveDoc } from "./InteractiveDoc";

// ... keep readOnly branch as-is ...

// In the non-readOnly return:
return <InteractiveDoc document={document} anchorCounts={anchorCounts} />;
```

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/DocumentRenderer.tsx src/components/InteractiveDoc.tsx
git commit -m "Wire selection capture in DocumentRenderer via InteractiveDoc subcomponent"
```

### Task 2.12: Wire CommentDrawer + HighlightPopover into the homepage

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update the homepage to fetch comment data + render the interactive layer**

At the top of `src/app/page.tsx`, add:

```tsx
import { CommentDrawer } from "@/components/CommentDrawer";
import { HighlightPopover } from "@/components/HighlightPopover";
import {
  countCommentsByAnchor,
  listCommentsForAnchor,
  getCurrentVersion,
} from "@/lib/db/queries";
```

Inside the page component, just before the `return`:

```tsx
const current = await getCurrentVersion();
let anchorCounts: Record<string, number> = {};
let commentsByAnchor: Record<string, Awaited<ReturnType<typeof listCommentsForAnchor>>> = {};
if (current) {
  anchorCounts = await countCommentsByAnchor(undefined as any, current.id);
  for (const anchorId of Object.keys(anchorCounts)) {
    commentsByAnchor[anchorId] = await listCommentsForAnchor(
      undefined as any,
      current.id,
      anchorId,
    );
  }
}
```

(`undefined as any` triggers the default db fallback in the query helpers. If the query signatures don't accept undefined as the first arg, refactor the helpers to use a default param `db: any = getDefaultDb()` — see existing pattern in `listPublishedAttestations`.)

At the end of the JSX, just before the closing `</div>`:

```tsx
<HighlightPopover enableSuggestChanges={false} />
{current ? (
  <CommentDrawer
    baseVersionId={current.id}
    commentsByAnchor={commentsByAnchor}
  />
) : null}
```

- [ ] **Step 2: Convert the homepage's hardcoded article cards into the doc-driven `DocumentRenderer`**

This is the section that currently maps over the local `articles` array. Replace it with:

```tsx
{current ? (
  <section className="bg-white px-6 pb-32 pt-10 sm:pt-14">
    <DocumentRenderer
      document={current.parsedJson as unknown as import("@/lib/markdown/parse").ParsedDocument}
      anchorCounts={anchorCounts}
    />
  </section>
) : null}
```

Remove the local `articles` array and the `pillColor`/`PILL_COLORS` helpers (no longer used). If "Connects to" pills need to live on, they'll come back in a later phase as parsed metadata; for now they're out of scope.

- [ ] **Step 3: Smoke-test locally**

Run: `pnpm dev` in one terminal. In another, `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/`
Expected: `200`.

Then open the homepage in a browser, hover a sentence — count badge appears. Select text inside a sentence — popover floats above. Click 💬 Comment → drawer opens (probably empty). Type a comment, submit — see it in the drawer.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "Wire per-sentence Comment UI into homepage"
```

### Task 2.13: Add admin comment moderation page (hide/unhide)

**Files:**
- Create: `src/app/admin/comments/page.tsx`
- Modify: `src/server/actions/comments.ts`

- [ ] **Step 1: Add `hideCommentAction` and `unhideCommentAction` to `src/server/actions/comments.ts`**

Append:

```ts
import { getCurrentAdmin } from "@/lib/admin/check";

export async function hideCommentAction(
  commentId: string,
  reason: string = "Admin hidden",
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") return { ok: false, error: "Forbidden." };
  await getDb()
    .update(comments)
    .set({ hiddenAt: new Date(), hiddenReason: reason })
    .where(eq(comments.id, commentId));
  revalidatePath("/");
  revalidatePath("/admin/comments");
  return { ok: true };
}

export async function unhideCommentAction(commentId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") return { ok: false, error: "Forbidden." };
  await getDb()
    .update(comments)
    .set({ hiddenAt: null, hiddenReason: null })
    .where(eq(comments.id, commentId));
  revalidatePath("/");
  revalidatePath("/admin/comments");
  return { ok: true };
}
```

- [ ] **Step 2: Create `src/app/admin/comments/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { comments, signers } from "@/lib/db/schema";
import { getCurrentAdmin } from "@/lib/admin/check";
import { hideCommentAction, unhideCommentAction } from "@/server/actions/comments";

export const dynamic = "force-dynamic";

async function handleHide(formData: FormData) {
  "use server";
  await hideCommentAction(String(formData.get("commentId")));
}
async function handleUnhide(formData: FormData) {
  "use server";
  await unhideCommentAction(String(formData.get("commentId")));
}

export default async function AdminCommentsPage() {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") notFound();

  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      anchorId: comments.anchorId,
      proposalId: comments.proposalId,
      displayName: signers.displayName,
      createdAt: comments.createdAt,
      hiddenAt: comments.hiddenAt,
    })
    .from(comments)
    .innerJoin(signers, eq(signers.id, comments.signerId))
    .orderBy(desc(comments.createdAt))
    .limit(100);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Admin · Comments</h1>
      <ul className="mt-6 space-y-3">
        {rows.map((c) => (
          <li
            key={c.id}
            className={`rounded border p-3 text-sm ${c.hiddenAt ? "border-zinc-200 bg-zinc-50" : "border-zinc-200 bg-white"}`}
          >
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-zinc-500">
                {c.displayName} on {c.anchorId ?? `proposal ${c.proposalId}`}
              </span>
              <span className="text-xs text-zinc-400">
                {new Date(c.createdAt).toISOString().slice(0, 16).replace("T", " ")}
              </span>
            </div>
            <p className="mt-1 text-zinc-800">{c.body}</p>
            <form action={c.hiddenAt ? handleUnhide : handleHide} className="mt-2">
              <input type="hidden" name="commentId" value={c.id} />
              <button
                type="submit"
                className={`rounded px-3 py-1 text-xs ${c.hiddenAt ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}
              >
                {c.hiddenAt ? "Unhide" : "Hide"}
              </button>
            </form>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 3: Smoke-test**

Sign in as admin, visit `http://localhost:3000/admin/comments`. Should list recent comments with a Hide / Unhide button each.

- [ ] **Step 4: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/comments/page.tsx src/server/actions/comments.ts
git commit -m "Add /admin/comments moderation page with hide/unhide"
```

### Task 2.14: Phase 2 — Done & PR

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all pass.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Add progress-log entry** following the pattern in Task 1.5.

- [ ] **Step 4: Push + open PR**

```bash
git push -u origin HEAD
gh pr create --title "Phase 2: per-sentence Comments on /" --body "Implements phase 2 of \`docs/superpowers/specs/2026-05-19-current-vs-proposed-tabs-design.md\`. Highlight popover with Comment (active) + Suggest Changes (disabled placeholder). Per-anchor CommentDrawer, threaded comments, upvotes, /admin/comments moderation."
```

---

## Phase 3: Proposed-edit composer + admin review queue + `/proposed` preview

> Requires phase 2 to be merged.

### Task 3.1: Add proposed-edit queries

**Files:**
- Modify: `src/lib/db/queries.ts`
- Create: `tests/lib/db.queries.proposed-edits.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/db.queries.proposed-edits.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { proposedEdits, signers, versions } from "@/lib/db/schema";
import {
  countProposalsByAnchor,
  getAcceptedProposalsForVersion,
  listProposalsByAnchor,
} from "@/lib/db/queries";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1}
y {#preamble-s-2}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [
    { version: "1.0.0", publishedAt: new Date(), markdown: md, agentsMd: "stub", specJson: "{}", isCurrent: true, gitCommitSha: null },
  ]);
  const [v] = await db.select().from(versions);
  const [s] = await db.insert(signers).values({ clerkUserId: "u1", displayName: "X", affiliation: null, locationText: null, verificationMethod: "email", verifiedAt: new Date() }).returning({ id: signers.id });
  return { db, versionId: v.id, signerId: s.id };
}

describe("countProposalsByAnchor", () => {
  it("returns pending+accepted counts per anchor", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(proposedEdits).values([
      { baseVersionId: versionId, proposerSignerId: signerId, kind: "replace", targetAnchorId: "preamble-s-1", newText: "a" },
      { baseVersionId: versionId, proposerSignerId: signerId, kind: "replace", targetAnchorId: "preamble-s-1", newText: "b", status: "accepted" },
      { baseVersionId: versionId, proposerSignerId: signerId, kind: "delete", targetAnchorId: "preamble-s-2" },
      { baseVersionId: versionId, proposerSignerId: signerId, kind: "replace", targetAnchorId: "preamble-s-1", newText: "c", status: "rejected" },
    ]);
    const counts = await countProposalsByAnchor(db, versionId);
    expect(counts).toEqual({ "preamble-s-1": { pending: 1, accepted: 1 }, "preamble-s-2": { pending: 1, accepted: 0 } });
  });
});

describe("listProposalsByAnchor", () => {
  it("returns pending+accepted, joined with display name", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(proposedEdits).values([
      { baseVersionId: versionId, proposerSignerId: signerId, kind: "replace", targetAnchorId: "preamble-s-1", newText: "first" },
      { baseVersionId: versionId, proposerSignerId: signerId, kind: "replace", targetAnchorId: "preamble-s-1", newText: "second", status: "accepted" },
    ]);
    const rows = await listProposalsByAnchor(db, versionId, "preamble-s-1");
    expect(rows).toHaveLength(2);
    expect(rows[0].proposerDisplayName).toBe("X");
  });
});

describe("getAcceptedProposalsForVersion", () => {
  it("returns only accepted edits for that base version", async () => {
    const { db, versionId, signerId } = await seed();
    await db.insert(proposedEdits).values([
      { baseVersionId: versionId, proposerSignerId: signerId, kind: "replace", targetAnchorId: "preamble-s-1", newText: "a" },
      { baseVersionId: versionId, proposerSignerId: signerId, kind: "delete", targetAnchorId: "preamble-s-2", status: "accepted" },
    ]);
    const rows = await getAcceptedProposalsForVersion(db, versionId);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("delete");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm exec vitest run tests/lib/db.queries.proposed-edits.test.ts`
Expected: FAIL — exports missing.

- [ ] **Step 3: Add the queries to `src/lib/db/queries.ts`**

Append:

```ts
import { proposedEdits } from "./schema";

export interface ProposalRow {
  id: string;
  kind: "replace" | "insert_after" | "delete";
  targetAnchorId: string;
  newText: string | null;
  rationale: string | null;
  status: "pending" | "accepted" | "rejected" | "stale" | "published";
  proposerSignerId: string;
  proposerDisplayName: string;
  createdAt: Date;
}

export async function countProposalsByAnchor(
  db: any,
  baseVersionId: string,
): Promise<Record<string, { pending: number; accepted: number }>> {
  const rows = await db
    .select({ anchorId: proposedEdits.targetAnchorId, status: proposedEdits.status })
    .from(proposedEdits)
    .where(eq(proposedEdits.baseVersionId, baseVersionId));
  const out: Record<string, { pending: number; accepted: number }> = {};
  for (const r of rows) {
    if (r.status !== "pending" && r.status !== "accepted") continue;
    const slot = out[r.anchorId] ?? { pending: 0, accepted: 0 };
    if (r.status === "pending") slot.pending += 1;
    else slot.accepted += 1;
    out[r.anchorId] = slot;
  }
  return out;
}

export async function listProposalsByAnchor(
  db: any,
  baseVersionId: string,
  anchorId: string,
): Promise<ProposalRow[]> {
  const rows = await db
    .select({
      id: proposedEdits.id,
      kind: proposedEdits.kind,
      targetAnchorId: proposedEdits.targetAnchorId,
      newText: proposedEdits.newText,
      rationale: proposedEdits.rationale,
      status: proposedEdits.status,
      proposerSignerId: proposedEdits.proposerSignerId,
      proposerDisplayName: signers.displayName,
      createdAt: proposedEdits.createdAt,
    })
    .from(proposedEdits)
    .innerJoin(signers, eq(signers.id, proposedEdits.proposerSignerId))
    .where(
      and(
        eq(proposedEdits.baseVersionId, baseVersionId),
        eq(proposedEdits.targetAnchorId, anchorId),
      ),
    )
    .orderBy(asc(proposedEdits.createdAt));
  return rows.filter((r: any) => r.status === "pending" || r.status === "accepted") as ProposalRow[];
}

export async function getAcceptedProposalsForVersion(
  db: any,
  baseVersionId: string,
): Promise<ProposalRow[]> {
  const rows = await db
    .select({
      id: proposedEdits.id,
      kind: proposedEdits.kind,
      targetAnchorId: proposedEdits.targetAnchorId,
      newText: proposedEdits.newText,
      rationale: proposedEdits.rationale,
      status: proposedEdits.status,
      proposerSignerId: proposedEdits.proposerSignerId,
      proposerDisplayName: signers.displayName,
      createdAt: proposedEdits.createdAt,
    })
    .from(proposedEdits)
    .innerJoin(signers, eq(signers.id, proposedEdits.proposerSignerId))
    .where(
      and(
        eq(proposedEdits.baseVersionId, baseVersionId),
        eq(proposedEdits.status, "accepted"),
      ),
    )
    .orderBy(asc(proposedEdits.createdAt));
  return rows as ProposalRow[];
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `pnpm exec vitest run tests/lib/db.queries.proposed-edits.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries.ts tests/lib/db.queries.proposed-edits.test.ts
git commit -m "Add proposed-edit queries"
```

### Task 3.2: Add proposal server actions

**Files:**
- Create: `src/server/actions/proposals.ts`
- Create: `tests/server/proposals.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/proposals.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { proposedEdits, signers, versions } from "@/lib/db/schema";
import {
  createProposal,
  acceptProposal,
  rejectProposal,
} from "@/server/actions/proposals";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [
    { version: "1.0.0", publishedAt: new Date(), markdown: md, agentsMd: "stub", specJson: "{}", isCurrent: true, gitCommitSha: null },
  ]);
  const [v] = await db.select().from(versions);
  const [s] = await db.insert(signers).values({ clerkUserId: "u1", displayName: "X", affiliation: null, locationText: null, verificationMethod: "email", verifiedAt: new Date() }).returning({ id: signers.id });
  const [admin] = await db.insert(signers).values({ clerkUserId: "admin1", displayName: "Admin", affiliation: null, locationText: null, verificationMethod: "email", verifiedAt: new Date(), isAdmin: true }).returning({ id: signers.id });
  return { db, versionId: v.id, signerId: s.id, adminId: admin.id };
}

describe("createProposal (data layer)", () => {
  it("inserts a 'replace' proposal", async () => {
    const { db, versionId, signerId } = await seed();
    const p = await createProposal(db, {
      baseVersionId: versionId,
      proposerSignerId: signerId,
      kind: "replace",
      targetAnchorId: "preamble-s-1",
      newText: "y",
      rationale: "shorter",
    });
    expect(p.id).toBeDefined();
    const rows = await db.select().from(proposedEdits);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].newText).toBe("y");
  });
  it("rejects 'replace' with no newText", async () => {
    const { db, versionId, signerId } = await seed();
    await expect(
      createProposal(db, { baseVersionId: versionId, proposerSignerId: signerId, kind: "replace", targetAnchorId: "preamble-s-1", newText: "", rationale: "" }),
    ).rejects.toThrow(/newText/i);
  });
  it("'delete' allows null newText", async () => {
    const { db, versionId, signerId } = await seed();
    const p = await createProposal(db, { baseVersionId: versionId, proposerSignerId: signerId, kind: "delete", targetAnchorId: "preamble-s-1", newText: null, rationale: "" });
    expect(p.id).toBeDefined();
  });
});

describe("acceptProposal", () => {
  it("marks the proposal accepted and auto-rejects conflicting replaces", async () => {
    const { db, versionId, signerId, adminId } = await seed();
    const p1 = await createProposal(db, { baseVersionId: versionId, proposerSignerId: signerId, kind: "replace", targetAnchorId: "preamble-s-1", newText: "a", rationale: "" });
    const p2 = await createProposal(db, { baseVersionId: versionId, proposerSignerId: signerId, kind: "replace", targetAnchorId: "preamble-s-1", newText: "b", rationale: "" });
    await acceptProposal(db, { proposalId: p1.id, deciderSignerId: adminId });
    const rows = await db.select().from(proposedEdits);
    const byId = Object.fromEntries(rows.map((r: any) => [r.id, r]));
    expect(byId[p1.id].status).toBe("accepted");
    expect(byId[p2.id].status).toBe("rejected");
  });
});

describe("rejectProposal", () => {
  it("marks pending → rejected and stamps decided_by", async () => {
    const { db, versionId, signerId, adminId } = await seed();
    const p = await createProposal(db, { baseVersionId: versionId, proposerSignerId: signerId, kind: "delete", targetAnchorId: "preamble-s-1", newText: null, rationale: "" });
    await rejectProposal(db, { proposalId: p.id, deciderSignerId: adminId });
    const [row] = await db.select().from(proposedEdits);
    expect(row.status).toBe("rejected");
    expect(row.decidedBy).toBe(adminId);
    expect(row.decidedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm exec vitest run tests/server/proposals.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/server/actions/proposals.ts`**

```ts
"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { proposedEdits, proposalUpvotes, signers } from "@/lib/db/schema";
import { getCurrentAdmin } from "@/lib/admin/check";
import { enforceRateLimit } from "@/lib/ratelimit/enforce";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

export interface CreateProposalInput {
  baseVersionId: string;
  proposerSignerId: string;
  kind: "replace" | "insert_after" | "delete";
  targetAnchorId: string;
  newText: string | null;
  rationale: string;
}

export async function createProposal(db: any, input: CreateProposalInput): Promise<{ id: string }> {
  if (input.kind !== "delete") {
    if (!input.newText || !input.newText.trim()) {
      throw new Error(`newText is required for kind=${input.kind}`);
    }
  }
  const [row] = await db
    .insert(proposedEdits)
    .values({
      baseVersionId: input.baseVersionId,
      proposerSignerId: input.proposerSignerId,
      kind: input.kind,
      targetAnchorId: input.targetAnchorId,
      newText: input.kind === "delete" ? null : input.newText!.trim(),
      rationale: input.rationale.trim() || null,
    })
    .returning({ id: proposedEdits.id });
  return { id: row.id };
}

export async function acceptProposal(
  db: any,
  input: { proposalId: string; deciderSignerId: string },
): Promise<void> {
  const [target] = await db
    .select()
    .from(proposedEdits)
    .where(eq(proposedEdits.id, input.proposalId))
    .limit(1);
  if (!target) throw new Error("Proposal not found.");
  if (target.status !== "pending") {
    throw new Error(`Cannot accept a proposal in status=${target.status}`);
  }
  await db
    .update(proposedEdits)
    .set({ status: "accepted", decidedAt: new Date(), decidedBy: input.deciderSignerId })
    .where(eq(proposedEdits.id, input.proposalId));

  // Conflict handling: if this is a replace, auto-reject all OTHER pending
  // replaces targeting the same anchor. If this is a delete, also auto-reject
  // pending insert_after on the same anchor.
  if (target.kind === "replace") {
    await db
      .update(proposedEdits)
      .set({ status: "rejected", decidedAt: new Date(), decidedBy: input.deciderSignerId })
      .where(
        and(
          eq(proposedEdits.baseVersionId, target.baseVersionId),
          eq(proposedEdits.targetAnchorId, target.targetAnchorId),
          eq(proposedEdits.kind, "replace"),
          eq(proposedEdits.status, "pending"),
          ne(proposedEdits.id, target.id),
        ),
      );
  }
  if (target.kind === "delete") {
    await db
      .update(proposedEdits)
      .set({ status: "rejected", decidedAt: new Date(), decidedBy: input.deciderSignerId })
      .where(
        and(
          eq(proposedEdits.baseVersionId, target.baseVersionId),
          eq(proposedEdits.targetAnchorId, target.targetAnchorId),
          eq(proposedEdits.kind, "insert_after"),
          eq(proposedEdits.status, "pending"),
        ),
      );
  }
}

export async function rejectProposal(
  db: any,
  input: { proposalId: string; deciderSignerId: string },
): Promise<void> {
  await db
    .update(proposedEdits)
    .set({ status: "rejected", decidedAt: new Date(), decidedBy: input.deciderSignerId })
    .where(eq(proposedEdits.id, input.proposalId));
}

// ----- Server actions with auth + rate-limit guards -----

export async function submitProposalAction(formData: FormData): Promise<{ ok: boolean; error?: string; id?: string }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const db = getDb();
  const me = await db.select({ id: signers.id, softBannedAt: signers.softBannedAt }).from(signers).where(eq(signers.clerkUserId, userId)).limit(1);
  if (me.length === 0) return { ok: false, error: "Sign first to propose changes." };
  if (me[0].softBannedAt) return { ok: false, error: "This account is suspended pending moderator review." };

  try {
    await enforceRateLimit(db, {
      bucket: "proposal",
      signerId: me[0].id,
      windowSec: 3600,
      max: 10,
      countSql: `SELECT count(*)::int as n FROM proposed_edits WHERE proposer_signer_id = $1 AND created_at > now() - interval '1 hour'`,
    });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }

  const baseVersionId = String(formData.get("baseVersionId") ?? "");
  const kind = String(formData.get("kind") ?? "") as "replace" | "insert_after" | "delete";
  const targetAnchorId = String(formData.get("targetAnchorId") ?? "");
  const newText = (formData.get("newText")?.toString() ?? "").trim() || null;
  const rationale = formData.get("rationale")?.toString() ?? "";

  try {
    const { id } = await createProposal(db, {
      baseVersionId,
      proposerSignerId: me[0].id,
      kind,
      targetAnchorId,
      newText,
      rationale,
    });
    revalidatePath("/proposed");
    revalidatePath("/admin/proposals");
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function acceptProposalAction(proposalId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") return { ok: false, error: "Forbidden." };
  try {
    await acceptProposal(getDb(), { proposalId, deciderSignerId: ctx.signer.id });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath("/proposed");
  revalidatePath("/admin/proposals");
  return { ok: true };
}

export async function rejectProposalAction(proposalId: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") return { ok: false, error: "Forbidden." };
  try {
    await rejectProposal(getDb(), { proposalId, deciderSignerId: ctx.signer.id });
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  revalidatePath("/proposed");
  revalidatePath("/admin/proposals");
  return { ok: true };
}

export async function toggleProposalUpvoteAction(proposalId: string): Promise<{ ok: boolean; error?: string; state?: "upvoted" | "removed" }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const db = getDb();
  const me = await db.select({ id: signers.id, softBannedAt: signers.softBannedAt }).from(signers).where(eq(signers.clerkUserId, userId)).limit(1);
  if (me.length === 0) return { ok: false, error: "Sign first to upvote." };
  if (me[0].softBannedAt) return { ok: false, error: "This account is suspended." };
  const existing = await db.select().from(proposalUpvotes).where(and(eq(proposalUpvotes.proposalId, proposalId), eq(proposalUpvotes.signerId, me[0].id))).limit(1);
  if (existing.length > 0) {
    await db.delete(proposalUpvotes).where(and(eq(proposalUpvotes.proposalId, proposalId), eq(proposalUpvotes.signerId, me[0].id)));
    revalidatePath("/proposed");
    return { ok: true, state: "removed" };
  }
  await db.insert(proposalUpvotes).values({ proposalId, signerId: me[0].id });
  revalidatePath("/proposed");
  return { ok: true, state: "upvoted" };
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `pnpm exec vitest run tests/server/proposals.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/proposals.ts tests/server/proposals.test.ts
git commit -m "Add proposal server actions with conflict resolution"
```

### Task 3.3: Pure apply-edits transformation

**Files:**
- Create: `src/lib/proposed/apply-edits.ts`
- Create: `tests/lib/proposed.apply-edits.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/proposed.apply-edits.test.ts
import { describe, expect, it } from "vitest";
import { parseDocument } from "@/lib/markdown/parse";
import { applyEdits } from "@/lib/proposed/apply-edits";
import type { ProposalRow } from "@/lib/db/queries";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
First. {#preamble-s-1} Second. {#preamble-s-2}
`;

const baseEdit = {
  id: "p1",
  status: "accepted" as const,
  proposerSignerId: "x",
  proposerDisplayName: "X",
  rationale: null,
  createdAt: new Date(),
};

describe("applyEdits", () => {
  it("returns base doc unchanged for empty edit list", () => {
    const doc = parseDocument(md);
    const out = applyEdits(doc, []);
    expect(out.articles[0].paragraphs[0].sentences.map((s) => s.text)).toEqual(["First.", "Second."]);
  });
  it("replaces a sentence", () => {
    const doc = parseDocument(md);
    const out = applyEdits(doc, [
      { ...baseEdit, kind: "replace", targetAnchorId: "preamble-s-1", newText: "Replaced.", id: "p1" } as ProposalRow,
    ]);
    const texts = out.articles[0].paragraphs[0].sentences.map((s) => s.text);
    expect(texts).toEqual(["Replaced.", "Second."]);
  });
  it("inserts after a sentence", () => {
    const doc = parseDocument(md);
    const out = applyEdits(doc, [
      { ...baseEdit, kind: "insert_after", targetAnchorId: "preamble-s-1", newText: "Inserted." } as ProposalRow,
    ]);
    const texts = out.articles[0].paragraphs[0].sentences.map((s) => s.text);
    expect(texts).toEqual(["First.", "Inserted.", "Second."]);
  });
  it("deletes a sentence", () => {
    const doc = parseDocument(md);
    const out = applyEdits(doc, [
      { ...baseEdit, kind: "delete", targetAnchorId: "preamble-s-2", newText: null } as ProposalRow,
    ]);
    const texts = out.articles[0].paragraphs[0].sentences.map((s) => s.text);
    expect(texts).toEqual(["First."]);
  });
  it("composes replace + insert_after + delete on different anchors", () => {
    const doc = parseDocument(md);
    const out = applyEdits(doc, [
      { ...baseEdit, id: "p1", kind: "replace", targetAnchorId: "preamble-s-1", newText: "A." } as ProposalRow,
      { ...baseEdit, id: "p2", kind: "insert_after", targetAnchorId: "preamble-s-1", newText: "B." } as ProposalRow,
      { ...baseEdit, id: "p3", kind: "delete", targetAnchorId: "preamble-s-2", newText: null } as ProposalRow,
    ]);
    const texts = out.articles[0].paragraphs[0].sentences.map((s) => s.text);
    expect(texts).toEqual(["A.", "B."]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm exec vitest run tests/lib/proposed.apply-edits.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/proposed/apply-edits.ts`**

```ts
// src/lib/proposed/apply-edits.ts
import type { ParsedDocument, Sentence } from "@/lib/markdown/parse";
import type { ProposalRow } from "@/lib/db/queries";

/**
 * Pure transformation: apply a set of accepted proposed edits to a parsed
 * document. Returns a NEW ParsedDocument; does not mutate.
 *
 * Inserts mint synthetic anchor IDs of the form `<anchor>-ins-<edit-id-short>`
 * so the preview can render them uniquely without polluting the original
 * markdown anchor namespace.
 */
export function applyEdits(
  doc: ParsedDocument,
  edits: ProposalRow[],
): ParsedDocument {
  const byTarget: Map<string, ProposalRow[]> = new Map();
  for (const e of edits) {
    const list = byTarget.get(e.targetAnchorId) ?? [];
    list.push(e);
    byTarget.set(e.targetAnchorId, list);
  }

  function mapSentences(sentences: Sentence[]): Sentence[] {
    const out: Sentence[] = [];
    for (const s of sentences) {
      const edits = byTarget.get(s.id) ?? [];
      const replace = edits.find((e) => e.kind === "replace");
      const del = edits.find((e) => e.kind === "delete");
      const inserts = edits.filter((e) => e.kind === "insert_after");

      if (del) {
        // Skip the sentence entirely; still apply inserts AFTER it (the
        // insert anchors to the now-deleted sentence's position).
        for (const ins of inserts) {
          out.push({
            id: `${s.id}-ins-${ins.id.slice(0, 8)}`,
            text: (ins.newText ?? "").trim(),
          });
        }
        continue;
      }

      if (replace) {
        out.push({ id: s.id, text: (replace.newText ?? "").trim() });
      } else {
        out.push(s);
      }

      for (const ins of inserts) {
        out.push({
          id: `${s.id}-ins-${ins.id.slice(0, 8)}`,
          text: (ins.newText ?? "").trim(),
        });
      }
    }
    return out;
  }

  return {
    ...doc,
    articles: doc.articles.map((article) => ({
      ...article,
      paragraphs: article.paragraphs.map((p) => ({
        ...p,
        sentences: mapSentences(p.sentences),
      })),
    })),
  };
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `pnpm exec vitest run tests/lib/proposed.apply-edits.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposed/apply-edits.ts tests/lib/proposed.apply-edits.test.ts
git commit -m "Add pure applyEdits transformer for /proposed preview"
```

### Task 3.4: SuggestChangesComposer component

**Files:**
- Create: `src/components/SuggestChangesComposer.tsx`

- [ ] **Step 1: Write the source**

```tsx
// src/components/SuggestChangesComposer.tsx
"use client";

import { FormEvent, useState, useTransition } from "react";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { submitProposalAction } from "@/server/actions/proposals";
import { saveDraft, clearDraft } from "@/lib/comments/draft";

interface Props {
  baseVersionId: string;
  anchorId: string;
  // Pre-fill: the original sentence's text, so "Replace" mode shows what
  // the user will be modifying.
  originalText: string;
  onSubmitted?: () => void;
  onCancel?: () => void;
}

type Kind = "replace" | "insert_after" | "delete";

export function SuggestChangesComposer({
  baseVersionId,
  anchorId,
  originalText,
  onSubmitted,
  onCancel,
}: Props) {
  const [kind, setKind] = useState<Kind>("replace");
  const [newText, setNewText] = useState(originalText);
  const [rationale, setRationale] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  function handleKindChange(k: Kind) {
    setKind(k);
    if (k === "insert_after") setNewText("");
    if (k === "replace" && !newText) setNewText(originalText);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (kind !== "delete" && !newText.trim()) {
      setError(kind === "replace" ? "Replacement text can't be empty." : "Inserted sentence can't be empty.");
      return;
    }
    if (!isSignedIn) {
      saveDraft({
        kind: "proposal",
        baseVersionId,
        anchorId,
        proposalKind: kind,
        rationale,
        body: kind === "delete" ? "" : newText.trim(),
        returnTo: window.location.pathname + "?draft=1",
        ts: Date.now(),
      });
      window.dispatchEvent(new CustomEvent("open-sign-modal"));
      return;
    }
    startTransition(async () => {
      const fd = new FormData();
      fd.set("baseVersionId", baseVersionId);
      fd.set("kind", kind);
      fd.set("targetAnchorId", anchorId);
      if (kind !== "delete") fd.set("newText", newText.trim());
      if (rationale.trim()) fd.set("rationale", rationale.trim());
      const res = await submitProposalAction(fd);
      if (!res.ok) {
        setError(res.error ?? "Couldn't save your proposal.");
        return;
      }
      clearDraft();
      router.refresh();
      onSubmitted?.();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-md border border-zinc-200 bg-white p-3">
      <fieldset>
        <legend className="text-xs font-medium text-zinc-700">Change type</legend>
        <div className="mt-1 flex gap-3 text-xs">
          {(["replace", "insert_after", "delete"] as Kind[]).map((k) => (
            <label key={k} className="flex items-center gap-1.5">
              <input type="radio" name="kind" checked={kind === k} onChange={() => handleKindChange(k)} />
              {k === "replace" ? "Replace" : k === "insert_after" ? "Insert after" : "Delete"}
            </label>
          ))}
        </div>
      </fieldset>
      {kind !== "delete" ? (
        <label className="block">
          <span className="text-xs font-medium text-zinc-700">
            {kind === "replace" ? "Replacement text" : "New sentence (added after the highlighted one)"}
          </span>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
        </label>
      ) : (
        <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          Deleting this sentence: &quot;{originalText}&quot;
        </p>
      )}
      <label className="block">
        <span className="text-xs font-medium text-zinc-700">Why? (rationale visible to admins + signers)</span>
        <textarea
          value={rationale}
          onChange={(e) => setRationale(e.target.value)}
          rows={2}
          placeholder="optional"
          className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        />
      </label>
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}
      <div className="flex justify-end gap-2">
        {onCancel ? (
          <button type="button" onClick={onCancel} className="rounded-full px-3 py-1 text-xs text-zinc-700 hover:bg-zinc-100">
            Cancel
          </button>
        ) : null}
        <button type="submit" disabled={pending} className="rounded-full bg-blue-600 px-4 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {pending ? "Saving…" : isSignedIn ? "Submit proposal" : "Sign in & propose"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/components/SuggestChangesComposer.tsx
git commit -m "Add SuggestChangesComposer (replace/insert_after/delete)"
```

### Task 3.5: ProposalCard + ProposalDrawer components

**Files:**
- Create: `src/components/ProposalCard.tsx`
- Create: `src/components/ProposalDrawer.tsx`

- [ ] **Step 1: Write ProposalCard**

```tsx
// src/components/ProposalCard.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ProposalRow } from "@/lib/db/queries";
import { acceptProposalAction, rejectProposalAction, toggleProposalUpvoteAction } from "@/server/actions/proposals";

interface Props {
  proposal: ProposalRow;
  originalText: string;
  isAdmin: boolean;
}

export function ProposalCard({ proposal, originalText, isAdmin }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className={`rounded-md border p-3 text-sm ${proposal.status === "accepted" ? "border-emerald-200 bg-emerald-50" : "border-zinc-200 bg-white"}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-zinc-700">
          {proposal.proposerDisplayName}{" "}
          <span className="ml-2 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono uppercase text-zinc-600">
            {proposal.kind}
          </span>
        </span>
        <span className="rounded-full px-2 py-0.5 text-xs font-semibold capitalize text-zinc-600">{proposal.status}</span>
      </div>
      <div className="mt-2 space-y-1 font-mono text-xs">
        <p><span className="text-red-700 line-through">{originalText}</span></p>
        {proposal.newText ? <p><span className="text-emerald-700">{proposal.newText}</span></p> : null}
        {proposal.kind === "delete" ? <p className="text-zinc-500 italic">(sentence will be removed)</p> : null}
      </div>
      {proposal.rationale ? (
        <p className="mt-2 rounded bg-zinc-50 px-2 py-1 text-xs text-zinc-700">{proposal.rationale}</p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => start(async () => { await toggleProposalUpvoteAction(proposal.id); router.refresh(); })}
          className="rounded-full border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-50"
          disabled={pending}
        >
          👍 Upvote
        </button>
        {isAdmin && proposal.status === "pending" ? (
          <>
            <button
              type="button"
              onClick={() => start(async () => { await acceptProposalAction(proposal.id); router.refresh(); })}
              className="rounded-full bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700"
              disabled={pending}
            >
              Accept
            </button>
            <button
              type="button"
              onClick={() => start(async () => { await rejectProposalAction(proposal.id); router.refresh(); })}
              className="rounded-full bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700"
              disabled={pending}
            >
              Reject
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write ProposalDrawer**

```tsx
// src/components/ProposalDrawer.tsx
"use client";

import { useEffect, useState } from "react";
import type { ProposalRow } from "@/lib/db/queries";
import { ProposalCard } from "./ProposalCard";
import { SuggestChangesComposer } from "./SuggestChangesComposer";

interface Props {
  baseVersionId: string;
  proposalsByAnchor: Record<string, ProposalRow[]>;
  originalTextByAnchor: Record<string, string>;
  isAdmin: boolean;
}

export function ProposalDrawer({ baseVersionId, proposalsByAnchor, originalTextByAnchor, isAdmin }: Props) {
  const [openAnchor, setOpenAnchor] = useState<string | null>(null);
  const [composeAnchor, setComposeAnchor] = useState<string | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      setOpenAnchor((e as CustomEvent<{ anchorId: string }>).detail.anchorId);
      setComposeAnchor(null);
    };
    const onCompose = (e: Event) => {
      const a = (e as CustomEvent<{ anchorId: string }>).detail.anchorId;
      setOpenAnchor(a);
      setComposeAnchor(a);
    };
    window.addEventListener("anchor-open-proposals", onOpen);
    window.addEventListener("compose-suggest", onCompose);
    return () => {
      window.removeEventListener("anchor-open-proposals", onOpen);
      window.removeEventListener("compose-suggest", onCompose);
    };
  }, []);

  if (!openAnchor) return null;
  const list = proposalsByAnchor[openAnchor] ?? [];
  const originalText = originalTextByAnchor[openAnchor] ?? "(unknown)";

  return (
    <aside className="fixed right-0 top-0 z-40 flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl sm:w-96">
      <header className="flex items-center justify-between border-b border-zinc-200 p-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">Proposed edits</p>
          <p className="text-sm font-mono text-zinc-700">{openAnchor}</p>
        </div>
        <button type="button" onClick={() => setOpenAnchor(null)} className="rounded-full px-3 py-1 text-sm hover:bg-zinc-100">
          Close
        </button>
      </header>
      <div className="flex-1 space-y-3 overflow-auto p-4">
        {list.length === 0 ? <p className="text-sm text-zinc-500">No proposals yet.</p> : null}
        {list.map((p) => (
          <ProposalCard key={p.id} proposal={p} originalText={originalText} isAdmin={isAdmin} />
        ))}
      </div>
      <footer className="border-t border-zinc-200 p-4">
        {composeAnchor === openAnchor ? (
          <SuggestChangesComposer
            baseVersionId={baseVersionId}
            anchorId={openAnchor}
            originalText={originalText}
            onSubmitted={() => setComposeAnchor(null)}
            onCancel={() => setComposeAnchor(null)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setComposeAnchor(openAnchor)}
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            Suggest a change
          </button>
        )}
      </footer>
    </aside>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/ProposalCard.tsx src/components/ProposalDrawer.tsx
git commit -m "Add ProposalCard + ProposalDrawer for /proposed"
```

### Task 3.6: Unify anchor-open event with a mode discriminator

**Files:**
- Modify: `src/components/AnchorSentence.tsx`
- Modify: `src/components/InteractiveDoc.tsx`
- Modify: `src/components/CommentDrawer.tsx`
- Modify: `src/components/ProposalDrawer.tsx`

Collapses the two events (`anchor-open-comments`, `anchor-open-proposals`) into a single `anchor-open` event with a `{ mode, anchorId }` detail. The Comment and Proposal drawers each filter on `detail.mode` so only the right one opens. The `mode` is threaded from each page (`/` passes `"comments"`, `/proposed` passes `"proposals"`).

- [ ] **Step 1: Replace `src/components/AnchorSentence.tsx`**

```tsx
"use client";

import type { ReactNode } from "react";

interface Props {
  anchorId: string;
  count: number;
  mode: "comments" | "proposals";
  children: ReactNode;
}

export function AnchorSentence({ anchorId, count, mode, children }: Props) {
  return (
    <span data-anchor-id={anchorId} className="group relative">
      {children}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          window.dispatchEvent(
            new CustomEvent("anchor-open", {
              detail: { mode, anchorId },
            }),
          );
        }}
        className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 align-middle text-[10px] font-medium text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-200"
        aria-label={`${mode === "comments" ? "Discuss" : "Edits on"} this sentence (${count})`}
      >
        {count > 0 ? `💬 ${count}` : "+"}
      </button>
    </span>
  );
}
```

- [ ] **Step 2: Replace `src/components/InteractiveDoc.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { ParsedDocument } from "@/lib/markdown/parse";
import { AnchorSentence } from "./AnchorSentence";

interface Props {
  document: ParsedDocument;
  anchorCounts: Record<string, number>;
  mode: "comments" | "proposals";
}

export function InteractiveDoc({ document, anchorCounts, mode }: Props) {
  const containerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (!text) return;
      let node: Node | null = sel.anchorNode;
      while (node && node.nodeType !== 1) node = node.parentNode;
      let anchorId: string | null = null;
      let cursor = node as HTMLElement | null;
      while (cursor) {
        const id = cursor.getAttribute?.("data-anchor-id");
        if (id) {
          anchorId = id;
          break;
        }
        cursor = cursor.parentElement;
      }
      if (!anchorId) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent("selection-in-anchor", {
          detail: {
            anchorId,
            mode,
            selectedText: text,
            rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
          },
        }),
      );
    }
    el.addEventListener("mouseup", onMouseUp);
    return () => el.removeEventListener("mouseup", onMouseUp);
  }, [mode]);

  return (
    <article ref={containerRef} className="prose prose-zinc max-w-none">
      {document.articles.map((article) => (
        <section key={article.id} id={article.id}>
          {article.id === "preamble" ? <h1>{article.title}</h1> : <h2>{article.title}</h2>}
          {article.paragraphs.map((paragraph) => (
            <p key={paragraph.id}>
              {paragraph.sentences.map((sentence, idx) => (
                <AnchorSentence
                  key={sentence.id}
                  anchorId={sentence.id}
                  count={anchorCounts[sentence.id] ?? 0}
                  mode={mode}
                >
                  {idx > 0 ? " " : ""}
                  {sentence.text}
                </AnchorSentence>
              ))}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
```

- [ ] **Step 3: Update `src/components/CommentDrawer.tsx` to listen for `anchor-open` with `mode === "comments"`**

Replace the `useEffect` block that listened for `"anchor-open-comments"` / `"compose-comment"` with:

```tsx
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ mode: "comments" | "proposals"; anchorId: string }>).detail;
      if (d.mode !== "comments") return;
      setOpenAnchor(d.anchorId);
      setComposeAnchor(null);
    };
    const onCompose = (e: Event) => {
      const d = (e as CustomEvent<{ mode?: "comments" | "proposals"; anchorId: string }>).detail;
      if (d.mode && d.mode !== "comments") return;
      setOpenAnchor(d.anchorId);
      setComposeAnchor(d.anchorId);
    };
    window.addEventListener("anchor-open", onOpen);
    window.addEventListener("compose-comment", onCompose);
    return () => {
      window.removeEventListener("anchor-open", onOpen);
      window.removeEventListener("compose-comment", onCompose);
    };
  }, []);
```

- [ ] **Step 4: Update `src/components/ProposalDrawer.tsx` to listen for `anchor-open` with `mode === "proposals"`**

Replace the `useEffect` block that listened for `"anchor-open-proposals"` / `"compose-suggest"` with:

```tsx
  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ mode: "comments" | "proposals"; anchorId: string }>).detail;
      if (d.mode !== "proposals") return;
      setOpenAnchor(d.anchorId);
      setComposeAnchor(null);
    };
    const onCompose = (e: Event) => {
      const d = (e as CustomEvent<{ anchorId: string }>).detail;
      setOpenAnchor(d.anchorId);
      setComposeAnchor(d.anchorId);
    };
    window.addEventListener("anchor-open", onOpen);
    window.addEventListener("compose-suggest", onCompose);
    return () => {
      window.removeEventListener("anchor-open", onOpen);
      window.removeEventListener("compose-suggest", onCompose);
    };
  }, []);
```

- [ ] **Step 5: Update the homepage to pass `mode="comments"` to `InteractiveDoc`**

In `src/app/page.tsx`, change:

```tsx
<DocumentRenderer document={...} anchorCounts={anchorCounts} />
```

to:

```tsx
<InteractiveDoc document={...} anchorCounts={anchorCounts} mode="comments" />
```

(Import `InteractiveDoc` at the top of the file. The `DocumentRenderer readOnly` mode is unchanged and still used by `/v/[version]` archive views.)

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/components/AnchorSentence.tsx src/components/InteractiveDoc.tsx src/components/CommentDrawer.tsx src/components/ProposalDrawer.tsx src/app/page.tsx
git commit -m "Unify anchor-open event with mode discriminator (comments|proposals)"
```

### Task 3.7: `/proposed` page

**Files:**
- Create: `src/app/proposed/page.tsx`

- [ ] **Step 1: Write the source**

```tsx
// src/app/proposed/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { signers } from "@/lib/db/schema";
import {
  getCurrentVersion,
  countProposalsByAnchor,
  listProposalsByAnchor,
  getAcceptedProposalsForVersion,
} from "@/lib/db/queries";
import { applyEdits } from "@/lib/proposed/apply-edits";
import { DocumentRenderer } from "@/components/DocumentRenderer";
import { InteractiveDoc } from "@/components/InteractiveDoc";
import { HighlightPopover } from "@/components/HighlightPopover";
import { ProposalDrawer } from "@/components/ProposalDrawer";
import type { ParsedDocument } from "@/lib/markdown/parse";
import type { ProposalRow } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export default async function ProposedPage() {
  const current = await getCurrentVersion();
  if (!current) notFound();

  const baseDoc = current.parsedJson as unknown as ParsedDocument;
  const accepted = await getAcceptedProposalsForVersion(undefined as any, current.id);
  const preview = applyEdits(baseDoc, accepted);

  const proposalCounts = await countProposalsByAnchor(undefined as any, current.id);
  // Convert {pending, accepted} -> a single "anything pending" count for badges.
  const anchorCounts: Record<string, number> = {};
  for (const [a, c] of Object.entries(proposalCounts)) {
    anchorCounts[a] = c.pending;
  }

  // For each anchor with proposals, list them.
  const proposalsByAnchor: Record<string, ProposalRow[]> = {};
  for (const anchor of Object.keys(proposalCounts)) {
    proposalsByAnchor[anchor] = await listProposalsByAnchor(undefined as any, current.id, anchor);
  }

  // Map anchor → original sentence text (from base doc, before edits applied).
  const originalTextByAnchor: Record<string, string> = {};
  for (const article of baseDoc.articles) {
    for (const p of article.paragraphs) {
      for (const s of p.sentences) {
        originalTextByAnchor[s.id] = s.text;
      }
    }
  }

  // Is the viewer admin?
  const { userId } = await auth();
  let isAdmin = false;
  if (userId) {
    const rows = await db.select({ isAdmin: signers.isAdmin }).from(signers).where(eq(signers.clerkUserId, userId)).limit(1);
    isAdmin = Boolean(rows[0]?.isAdmin);
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <nav className="mb-8 flex gap-2 text-sm">
        <Link href="/" className="rounded-full bg-zinc-100 px-4 py-1.5 font-medium text-zinc-700 hover:bg-zinc-200">
          ← v{current.version} (Current)
        </Link>
        <span className="rounded-full bg-zinc-900 px-4 py-1.5 font-semibold text-white">Working draft (Proposed)</span>
      </nav>
      <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        This is a working draft of the next version. Admins will release it when ready.
      </p>
      <div className="mt-8">
        <InteractiveDoc document={preview} anchorCounts={anchorCounts} mode="proposals" />
      </div>
      <HighlightPopover enableSuggestChanges={true} />
      <ProposalDrawer
        baseVersionId={current.id}
        proposalsByAnchor={proposalsByAnchor}
        originalTextByAnchor={originalTextByAnchor}
        isAdmin={isAdmin}
      />
    </main>
  );
}
```

- [ ] **Step 2: Smoke-test locally**

`pnpm dev`, visit `http://localhost:3000/proposed`. Expected: page renders with the doc; no proposals yet; "Working draft" tab is visible.

Then go back to `/`, highlight some text, click "Suggest Changes" — should be disabled (correct, phase 2 behavior on `/`). Go to `/proposed`, highlight, click — composer opens.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/proposed/page.tsx
git commit -m "Add /proposed page with preview rendering and Suggest-Changes flow"
```

### Task 3.8: Admin review queue at `/admin/proposals`

**Files:**
- Create: `src/app/admin/proposals/page.tsx`

- [ ] **Step 1: Write the source**

```tsx
// src/app/admin/proposals/page.tsx
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { proposedEdits, signers } from "@/lib/db/schema";
import { getCurrentAdmin } from "@/lib/admin/check";
import { acceptProposalAction, rejectProposalAction } from "@/server/actions/proposals";

export const dynamic = "force-dynamic";

async function handleAccept(formData: FormData) {
  "use server";
  await acceptProposalAction(String(formData.get("proposalId")));
}
async function handleReject(formData: FormData) {
  "use server";
  await rejectProposalAction(String(formData.get("proposalId")));
}

export default async function AdminProposalsPage() {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") notFound();

  const rows = await db
    .select({
      id: proposedEdits.id,
      kind: proposedEdits.kind,
      anchorId: proposedEdits.targetAnchorId,
      newText: proposedEdits.newText,
      rationale: proposedEdits.rationale,
      status: proposedEdits.status,
      createdAt: proposedEdits.createdAt,
      proposerName: signers.displayName,
    })
    .from(proposedEdits)
    .innerJoin(signers, eq(signers.id, proposedEdits.proposerSignerId))
    .where(eq(proposedEdits.status, "pending"))
    .orderBy(desc(proposedEdits.createdAt));

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Admin · Proposed edits</h1>
      <p className="mt-2 text-sm text-zinc-600">Pending proposals only. Accepted edits appear on /proposed.</p>
      <ul className="mt-6 space-y-3">
        {rows.length === 0 ? <p className="text-sm text-zinc-500">No pending proposals.</p> : null}
        {rows.map((r) => (
          <li key={r.id} className="rounded border border-zinc-200 bg-white p-3 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-zinc-500">
                {r.proposerName} · <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] uppercase">{r.kind}</span> on {r.anchorId}
              </span>
              <span className="text-xs text-zinc-400">{new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ")}</span>
            </div>
            {r.newText ? <p className="mt-1 font-mono text-xs text-emerald-700">{r.newText}</p> : null}
            {r.rationale ? <p className="mt-1 rounded bg-zinc-50 px-2 py-1 text-xs text-zinc-700">{r.rationale}</p> : null}
            <div className="mt-2 flex gap-2">
              <form action={handleAccept}>
                <input type="hidden" name="proposalId" value={r.id} />
                <button type="submit" className="rounded bg-emerald-600 px-3 py-1 text-xs text-white hover:bg-emerald-700">Accept</button>
              </form>
              <form action={handleReject}>
                <input type="hidden" name="proposalId" value={r.id} />
                <button type="submit" className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700">Reject</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Smoke-test as admin**

Visit `http://localhost:3000/admin/proposals` while signed in as admin. Submit a proposal via `/proposed`, then refresh `/admin/proposals` — should appear with Accept/Reject. Click Accept; refresh `/proposed`; the proposed text now shows in the preview.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/proposals/page.tsx
git commit -m "Add /admin/proposals review queue"
```

### Task 3.9: Surface a "View proposed →" link in the homepage header

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add a link below the H1**

Find the header section (the one with "Nine commitments…") and add below it:

```tsx
<p className="mt-4 text-center text-xs text-zinc-500">
  Working on the next version?{" "}
  <Link href="/proposed" className="text-zinc-700 underline-offset-4 hover:underline">
    View the proposed draft →
  </Link>
</p>
```

- [ ] **Step 2: Smoke-test**

`pnpm dev`, visit `/`, see the new link, click it, lands on `/proposed`.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "Link to /proposed from homepage header"
```

### Task 3.10: Phase 3 — Done & PR

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all pass.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Progress-log entry** following Task 1.5's pattern.

- [ ] **Step 4: Push + open PR**

```bash
git push -u origin HEAD
gh pr create --title "Phase 3: proposed-edit composer + /proposed preview + admin queue" --body "Implements phase 3 of \`docs/superpowers/specs/2026-05-19-current-vs-proposed-tabs-design.md\`. /proposed page with applyEdits preview, ProposalDrawer with admin Accept/Reject, /admin/proposals review queue. Release flow still pending phase 4."
```

---

## Phase 4: Release flow + endorsement-to-signature conversion

> Requires phase 3 to be merged.

### Task 4.1: serialize-markdown utility (preserves anchor IDs)

**Files:**
- Create: `src/lib/proposed/serialize-markdown.ts`
- Create: `tests/lib/proposed.serialize-markdown.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/proposed.serialize-markdown.test.ts
import { describe, expect, it } from "vitest";
import { parseDocument } from "@/lib/markdown/parse";
import { applyEdits } from "@/lib/proposed/apply-edits";
import { serializeMarkdown } from "@/lib/proposed/serialize-markdown";
import type { ProposalRow } from "@/lib/db/queries";

const baseEdit = {
  id: "p1",
  status: "accepted" as const,
  proposerSignerId: "x",
  proposerDisplayName: "X",
  rationale: null,
  createdAt: new Date(),
};

const md = `---
version: 1.0.0
published_at: 2026-05-18
---

# T {#preamble}

First. {#preamble-s-1} Second. {#preamble-s-2}
`;

describe("serializeMarkdown", () => {
  it("round-trips an unchanged doc with original anchor IDs", () => {
    const doc = parseDocument(md);
    const out = serializeMarkdown(doc, "1.0.0", "2026-05-18");
    const re = parseDocument(out);
    expect(re.articles[0].paragraphs[0].sentences.map((s) => s.id)).toEqual(["preamble-s-1", "preamble-s-2"]);
    expect(re.articles[0].paragraphs[0].sentences.map((s) => s.text)).toEqual(["First.", "Second."]);
  });

  it("preserves anchor IDs for sentences unchanged by edits", () => {
    const doc = parseDocument(md);
    const out = applyEdits(doc, [
      { ...baseEdit, kind: "replace", targetAnchorId: "preamble-s-1", newText: "Changed." } as ProposalRow,
    ]);
    const text = serializeMarkdown(out, "1.0.0", "2026-05-18");
    const re = parseDocument(text);
    expect(re.articles[0].paragraphs[0].sentences.map((s) => s.id)).toEqual(["preamble-s-1", "preamble-s-2"]);
    expect(re.articles[0].paragraphs[0].sentences[0].text).toBe("Changed.");
  });

  it("emits stable IDs for inserted sentences", () => {
    const doc = parseDocument(md);
    const out = applyEdits(doc, [
      { ...baseEdit, kind: "insert_after", targetAnchorId: "preamble-s-1", newText: "Inserted." } as ProposalRow,
    ]);
    const text = serializeMarkdown(out, "1.0.0", "2026-05-18");
    const re = parseDocument(text);
    const ids = re.articles[0].paragraphs[0].sentences.map((s) => s.id);
    expect(ids[0]).toBe("preamble-s-1");
    expect(ids[1].startsWith("preamble-s-1-ins-")).toBe(true);
    expect(ids[2]).toBe("preamble-s-2");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm exec vitest run tests/lib/proposed.serialize-markdown.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `src/lib/proposed/serialize-markdown.ts`**

```ts
// src/lib/proposed/serialize-markdown.ts
import type { ParsedDocument } from "@/lib/markdown/parse";

/**
 * Emit markdown text from a (possibly edit-applied) ParsedDocument,
 * preserving the {#anchor-id} markers so the next version's parsed
 * document keeps the same IDs for unchanged sentences.
 *
 * Caveat for v1: we assume the parsed document was originally produced by
 * our own parser (anchor-aware). Round-tripping arbitrary markdown
 * formatting features (bold, links, blockquotes) is NOT supported here —
 * spec section "Markdown formatting inside edits" deferred to v2.
 */
export function serializeMarkdown(
  doc: ParsedDocument,
  versionString: string,
  publishedAt: string,
): string {
  const lines: string[] = [];
  lines.push("---");
  lines.push(`version: ${versionString}`);
  lines.push(`published_at: ${publishedAt}`);
  lines.push("---");
  lines.push("");
  for (const article of doc.articles) {
    if (article.id === "preamble") {
      lines.push(`# ${article.title} {#${article.id}}`);
    } else {
      lines.push(`## ${article.title} {#${article.id}}`);
    }
    lines.push("");
    for (const p of article.paragraphs) {
      const sentenceTexts = p.sentences.map((s) => `${s.text} {#${s.id}}`);
      lines.push(sentenceTexts.join(" "));
      lines.push("");
    }
  }
  return lines.join("\n");
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `pnpm exec vitest run tests/lib/proposed.serialize-markdown.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposed/serialize-markdown.ts tests/lib/proposed.serialize-markdown.test.ts
git commit -m "Add serializeMarkdown emitting anchor-stable markdown"
```

### Task 4.2: EndorseButton + endorsements server action

**Files:**
- Create: `src/server/actions/endorsements.ts`
- Create: `src/components/EndorseButton.tsx`
- Modify: `src/lib/db/queries.ts` — add `listEndorsersForVersion`, `getMyEndorsementForVersion`
- Create: `tests/server/endorsements.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/endorsements.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { endorsements, signers, versions } from "@/lib/db/schema";
import { toggleEndorsement } from "@/server/actions/endorsements";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [
    { version: "1.0.0", publishedAt: new Date(), markdown: md, agentsMd: "stub", specJson: "{}", isCurrent: true, gitCommitSha: null },
  ]);
  const [v] = await db.select().from(versions);
  const [s] = await db.insert(signers).values({ clerkUserId: "u1", displayName: "X", affiliation: null, locationText: null, verificationMethod: "email", verifiedAt: new Date() }).returning({ id: signers.id });
  return { db, versionId: v.id, signerId: s.id };
}

describe("toggleEndorsement", () => {
  it("inserts and removes", async () => {
    const { db, versionId, signerId } = await seed();
    const a = await toggleEndorsement(db, { signerId, baseVersionId: versionId });
    expect(a.state).toBe("endorsed");
    const b = await toggleEndorsement(db, { signerId, baseVersionId: versionId });
    expect(b.state).toBe("removed");
    const rows = await db.select().from(endorsements);
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/server/actions/endorsements.ts`**

```ts
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@clerk/nextjs/server";
import { endorsements, signers } from "@/lib/db/schema";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

export async function toggleEndorsement(
  db: any,
  input: { signerId: string; baseVersionId: string },
): Promise<{ state: "endorsed" | "removed" }> {
  const existing = await db
    .select()
    .from(endorsements)
    .where(and(eq(endorsements.signerId, input.signerId), eq(endorsements.baseVersionId, input.baseVersionId)))
    .limit(1);
  if (existing.length > 0 && !existing[0].convertedAt) {
    await db
      .delete(endorsements)
      .where(and(eq(endorsements.signerId, input.signerId), eq(endorsements.baseVersionId, input.baseVersionId)));
    return { state: "removed" };
  }
  await db.insert(endorsements).values({ signerId: input.signerId, baseVersionId: input.baseVersionId });
  return { state: "endorsed" };
}

export async function toggleEndorsementAction(baseVersionId: string): Promise<{ ok: boolean; error?: string; state?: "endorsed" | "removed" }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in." };
  const db = getDb();
  const me = await db.select({ id: signers.id, softBannedAt: signers.softBannedAt }).from(signers).where(eq(signers.clerkUserId, userId)).limit(1);
  if (me.length === 0) return { ok: false, error: "Sign first to endorse." };
  if (me[0].softBannedAt) return { ok: false, error: "This account is suspended." };
  const res = await toggleEndorsement(db, { signerId: me[0].id, baseVersionId });
  revalidatePath("/proposed");
  return { ok: true, state: res.state };
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec vitest run tests/server/endorsements.test.ts`
Expected: 1 passed.

- [ ] **Step 5: Add the queries**

Append to `src/lib/db/queries.ts`:

```ts
import { endorsements } from "./schema";

export async function getMyEndorsementForVersion(
  db: any,
  signerId: string,
  baseVersionId: string,
): Promise<{ id: string } | null> {
  const rows = await db.select({ id: endorsements.id }).from(endorsements).where(and(eq(endorsements.signerId, signerId), eq(endorsements.baseVersionId, baseVersionId))).limit(1);
  return rows[0] ?? null;
}

export async function listEndorsersForVersion(
  db: any,
  baseVersionId: string,
): Promise<Array<{ signerId: string; displayName: string }>> {
  const rows = await db
    .select({ signerId: endorsements.signerId, displayName: signers.displayName })
    .from(endorsements)
    .innerJoin(signers, eq(signers.id, endorsements.signerId))
    .where(and(eq(endorsements.baseVersionId, baseVersionId)));
  return rows;
}
```

- [ ] **Step 6: EndorseButton component**

```tsx
// src/components/EndorseButton.tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleEndorsementAction } from "@/server/actions/endorsements";

interface Props {
  baseVersionId: string;
  initialEndorsed: boolean;
  endorserCount: number;
}

export function EndorseButton({ baseVersionId, initialEndorsed, endorserCount }: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => start(async () => { await toggleEndorsementAction(baseVersionId); router.refresh(); })}
      disabled={pending}
      className={`rounded-full px-5 py-2 text-sm font-semibold ${initialEndorsed ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-zinc-900 text-white hover:bg-zinc-700"}`}
    >
      {initialEndorsed ? "✓ Endorsing this direction" : "Endorse direction"}
      <span className="ml-2 text-xs opacity-80">{endorserCount} so far</span>
    </button>
  );
}
```

- [ ] **Step 7: Wire EndorseButton into `/proposed`**

In `src/app/proposed/page.tsx`, after the auth lookup, fetch:

```tsx
import { listEndorsersForVersion, getMyEndorsementForVersion } from "@/lib/db/queries";
import { EndorseButton } from "@/components/EndorseButton";

const endorsers = await listEndorsersForVersion(undefined as any, current.id);
let myEndorsement = null;
if (userId) {
  const me = await db.select({ id: signers.id }).from(signers).where(eq(signers.clerkUserId, userId)).limit(1);
  if (me[0]) myEndorsement = await getMyEndorsementForVersion(undefined as any, me[0].id, current.id);
}
```

And add the button next to the page header:

```tsx
<div className="mt-4">
  <EndorseButton
    baseVersionId={current.id}
    initialEndorsed={Boolean(myEndorsement)}
    endorserCount={endorsers.length}
  />
</div>
```

- [ ] **Step 8: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add src/server/actions/endorsements.ts src/components/EndorseButton.tsx src/lib/db/queries.ts src/app/proposed/page.tsx tests/server/endorsements.test.ts
git commit -m "Add Endorse Direction button + endorsements server action"
```

### Task 4.3: releaseConversionEmail template

**Files:**
- Modify: `src/lib/email/templates.ts`

- [ ] **Step 1: Append to `src/lib/email/templates.ts`**

```ts
export function releaseConversionEmail(opts: {
  displayName: string;
  newVersion: string;
  signUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `Your endorsed draft just shipped as v${opts.newVersion}`,
    text: `Hi ${opts.displayName},

A new version of the AI Bill of Rights just shipped: v${opts.newVersion}. You endorsed it while it was a working draft — thanks for shaping it.

Sign v${opts.newVersion} now to make it official: ${opts.signUrl}

— The AI Bill of Rights project
`,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/email/templates.ts
git commit -m "Add releaseConversionEmail template"
```

### Task 4.4: releaseVersionAction

**Files:**
- Create: `src/server/actions/release.ts`
- Create: `tests/server/release.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/server/release.test.ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { endorsements, proposedEdits, signers, versions } from "@/lib/db/schema";
import { releaseVersion } from "@/server/actions/release";
import { eq } from "drizzle-orm";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
First. {#preamble-s-1} Second. {#preamble-s-2}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [
    { version: "1.0.0", publishedAt: new Date(), markdown: md, agentsMd: "stub", specJson: "{}", isCurrent: true, gitCommitSha: null },
  ]);
  const [v] = await db.select().from(versions);
  const [admin] = await db.insert(signers).values({ clerkUserId: "a", displayName: "Admin", affiliation: null, locationText: null, verificationMethod: "email", verifiedAt: new Date(), isAdmin: true }).returning({ id: signers.id });
  const [s] = await db.insert(signers).values({ clerkUserId: "u1", displayName: "X", affiliation: null, locationText: null, verificationMethod: "email", verifiedAt: new Date() }).returning({ id: signers.id });
  return { db, versionId: v.id, adminId: admin.id, signerId: s.id };
}

describe("releaseVersion", () => {
  it("creates a new version row with the new version string + applied edits", async () => {
    const { db, versionId, adminId, signerId } = await seed();
    await db.insert(proposedEdits).values({ baseVersionId: versionId, proposerSignerId: signerId, kind: "replace", targetAnchorId: "preamble-s-1", newText: "Changed.", status: "accepted" });
    await releaseVersion(db, {
      baseVersionId: versionId,
      newVersionString: "1.0.1",
      deciderSignerId: adminId,
    });
    const vs = await db.select().from(versions);
    expect(vs).toHaveLength(2);
    const newV = vs.find((v: any) => v.version === "1.0.1");
    expect(newV).toBeDefined();
    expect(newV.isCurrent).toBe(true);
    // Confirm proposed_edits got marked published.
    const eds = await db.select().from(proposedEdits);
    expect(eds[0].status).toBe("published");
    expect(eds[0].publishedInVersionId).toBe(newV.id);
  });

  it("marks remaining pending proposals as stale", async () => {
    const { db, versionId, adminId, signerId } = await seed();
    await db.insert(proposedEdits).values({ baseVersionId: versionId, proposerSignerId: signerId, kind: "replace", targetAnchorId: "preamble-s-1", newText: "Accepted.", status: "accepted" });
    const [p2] = await db.insert(proposedEdits).values({ baseVersionId: versionId, proposerSignerId: signerId, kind: "delete", targetAnchorId: "preamble-s-2", status: "pending" }).returning({ id: proposedEdits.id });
    await releaseVersion(db, { baseVersionId: versionId, newVersionString: "1.0.1", deciderSignerId: adminId });
    const [pending2] = await db.select().from(proposedEdits).where(eq(proposedEdits.id, p2.id));
    expect(pending2.status).toBe("stale");
  });

  it("refuses release with zero accepted edits", async () => {
    const { db, versionId, adminId } = await seed();
    await expect(
      releaseVersion(db, { baseVersionId: versionId, newVersionString: "1.0.1", deciderSignerId: adminId }),
    ).rejects.toThrow(/no.*accepted/i);
  });

  it("stamps endorsements' convertedToVersionId + convertedAt", async () => {
    const { db, versionId, adminId, signerId } = await seed();
    await db.insert(endorsements).values({ signerId, baseVersionId: versionId });
    await db.insert(proposedEdits).values({ baseVersionId: versionId, proposerSignerId: signerId, kind: "replace", targetAnchorId: "preamble-s-1", newText: "X.", status: "accepted" });
    await releaseVersion(db, { baseVersionId: versionId, newVersionString: "1.0.1", deciderSignerId: adminId });
    const [e] = await db.select().from(endorsements);
    expect(e.convertedToVersionId).not.toBeNull();
    expect(e.convertedAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `src/server/actions/release.ts`**

```ts
"use server";

import { eq, and, sql } from "drizzle-orm";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { endorsements, proposedEdits, versions, signers } from "@/lib/db/schema";
import { getAcceptedProposalsForVersion } from "@/lib/db/queries";
import { applyEdits } from "@/lib/proposed/apply-edits";
import { serializeMarkdown } from "@/lib/proposed/serialize-markdown";
import { parseDocument } from "@/lib/markdown/parse";
import { getCurrentAdmin } from "@/lib/admin/check";
import { releaseConversionEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/send";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function releaseVersion(
  db: any,
  input: { baseVersionId: string; newVersionString: string; deciderSignerId: string },
): Promise<{ newVersionId: string }> {
  const [base] = await db.select().from(versions).where(eq(versions.id, input.baseVersionId));
  if (!base) throw new Error("Base version not found.");

  const accepted = await getAcceptedProposalsForVersion(db, input.baseVersionId);
  if (accepted.length === 0) {
    throw new Error("No changes to release. Accept at least one proposal first.");
  }
  const dest = await db.select().from(versions).where(eq(versions.version, input.newVersionString)).limit(1);
  if (dest.length > 0) throw new Error(`Version ${input.newVersionString} already exists.`);

  const baseDoc = base.parsedJson as any;
  const newDoc = applyEdits(baseDoc, accepted);
  const publishedAt = new Date().toISOString().slice(0, 10);
  const newMarkdown = serializeMarkdown(newDoc, input.newVersionString, publishedAt);
  const parsed = parseDocument(newMarkdown);

  // Insert new version row. Flip is_current.
  await db.update(versions).set({ isCurrent: false });
  const [inserted] = await db
    .insert(versions)
    .values({
      version: input.newVersionString,
      publishedAt: new Date(`${publishedAt}T00:00:00Z`),
      markdownHash: sha256(newMarkdown),
      agentsMdHash: base.agentsMdHash,
      specJsonHash: base.specJsonHash,
      parsedJson: parsed,
      isCurrent: true,
      gitCommitSha: null,
      isUserFork: false,
      parentVersionId: input.baseVersionId,
    })
    .returning({ id: versions.id });

  // Stamp proposals.
  await db
    .update(proposedEdits)
    .set({ status: "published", publishedInVersionId: inserted.id, decidedBy: input.deciderSignerId, decidedAt: new Date() })
    .where(and(eq(proposedEdits.baseVersionId, input.baseVersionId), eq(proposedEdits.status, "accepted")));
  await db
    .update(proposedEdits)
    .set({ status: "stale" })
    .where(and(eq(proposedEdits.baseVersionId, input.baseVersionId), eq(proposedEdits.status, "pending")));

  // Stamp endorsements (mark all unconverted endorsers as converted to this version).
  await db
    .update(endorsements)
    .set({ convertedToVersionId: inserted.id, convertedAt: new Date() })
    .where(and(eq(endorsements.baseVersionId, input.baseVersionId), sql`converted_at IS NULL`));

  return { newVersionId: inserted.id };
}

export async function releaseVersionAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") return { ok: false, error: "Forbidden." };
  const baseVersionId = String(formData.get("baseVersionId") ?? "");
  const newVersionString = String(formData.get("newVersionString") ?? "");
  const db = getDb();
  try {
    const { newVersionId } = await releaseVersion(db, {
      baseVersionId,
      newVersionString,
      deciderSignerId: ctx.signer.id,
    });

    // Fire conversion emails to endorsers. Best-effort; failures are logged
    // but don't block the release.
    const endorsersRows = await db
      .select({ signerId: endorsements.signerId, convertedToVersionId: endorsements.convertedToVersionId })
      .from(endorsements)
      .where(and(eq(endorsements.convertedToVersionId, newVersionId)));
    if (endorsersRows.length > 0) {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ai-for-people.org";
      const { clerkClient } = await import("@clerk/nextjs/server");
      const clerk = await clerkClient();
      for (const e of endorsersRows) {
        try {
          const [s] = await db.select().from(signers).where(eq(signers.id, e.signerId));
          if (!s) continue;
          let email: string | null = null;
          if (!s.clerkUserId.startsWith("admin-added-")) {
            try {
              const u = await clerk.users.getUser(s.clerkUserId);
              email = u.primaryEmailAddress?.emailAddress ?? null;
            } catch { /* fall through */ }
          }
          if (!email) continue;
          const tpl = releaseConversionEmail({
            displayName: s.displayName,
            newVersion: newVersionString,
            signUrl: `${siteUrl}/?v=${newVersionString}`,
          });
          await sendEmail({ to: email, ...tpl });
        } catch (err) {
          console.warn("conversion email failed:", err);
        }
      }
    }

    revalidatePath("/");
    revalidatePath("/proposed");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
```

- [ ] **Step 4: Run the test — expect PASS**

Run: `pnpm exec vitest run tests/server/release.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/release.ts tests/server/release.test.ts
git commit -m "Add releaseVersion: creates new version row, stamps proposals + endorsements"
```

### Task 4.5: `/admin/release` page

**Files:**
- Create: `src/app/admin/release/page.tsx`

- [ ] **Step 1: Write the source**

```tsx
// src/app/admin/release/page.tsx
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { versions } from "@/lib/db/schema";
import { getAcceptedProposalsForVersion, listEndorsersForVersion } from "@/lib/db/queries";
import { eq } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/admin/check";
import { releaseVersionAction } from "@/server/actions/release";

export const dynamic = "force-dynamic";

function bumpSuggestions(current: string): { patch: string; minor: string; major: string } {
  const m = current.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return { patch: current, minor: current, major: current };
  const [, maj, min, pat] = m;
  return {
    patch: `${maj}.${min}.${Number(pat) + 1}`,
    minor: `${maj}.${Number(min) + 1}.0`,
    major: `${Number(maj) + 1}.0.0`,
  };
}

export default async function AdminReleasePage() {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") notFound();

  const rows = await db.select().from(versions).where(eq(versions.isCurrent, true)).limit(1);
  const current = rows[0];
  if (!current) {
    return <main className="px-6 py-12"><p>No current version.</p></main>;
  }
  const accepted = await getAcceptedProposalsForVersion(undefined as any, current.id);
  const endorsers = await listEndorsersForVersion(undefined as any, current.id);
  const suggestions = bumpSuggestions(current.version);

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Release a new version</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Current: <span className="font-mono">v{current.version}</span> · {accepted.length} accepted edits · {endorsers.length} endorsers waiting.
      </p>
      {accepted.length === 0 ? (
        <p className="mt-6 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">No accepted edits yet. Accept at least one proposal before releasing.</p>
      ) : (
        <form action={releaseVersionAction} className="mt-6 space-y-4 rounded-md border border-zinc-200 bg-white p-4">
          <input type="hidden" name="baseVersionId" value={current.id} />
          <fieldset>
            <legend className="text-xs font-medium text-zinc-700">New version string</legend>
            <div className="mt-2 flex flex-col gap-1 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="newVersionString" value={suggestions.patch} defaultChecked />
                <span className="font-mono">v{suggestions.patch}</span>
                <span className="text-xs text-zinc-500">(patch)</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="newVersionString" value={suggestions.minor} />
                <span className="font-mono">v{suggestions.minor}</span>
                <span className="text-xs text-zinc-500">(minor)</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="newVersionString" value={suggestions.major} />
                <span className="font-mono">v{suggestions.major}</span>
                <span className="text-xs text-zinc-500">(major)</span>
              </label>
            </div>
          </fieldset>
          <button type="submit" className="rounded-full bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            Release →
          </button>
        </form>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Smoke-test as admin**

Accept a proposal on `/admin/proposals`. Visit `/admin/release`. Pick a bump tier. Click Release. Confirm:
- A new row appears in `versions` table with the new string + parsed JSON containing the edits applied.
- `/` now renders that new version.
- `/proposed` is empty (no accepted edits against the new version yet).
- Endorsers (if any in dev DB) get the conversion email.

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/release/page.tsx
git commit -m "Add /admin/release page with bump-tier picker"
```

### Task 4.6: Add a link from /admin to /admin/release

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Add a tile/link**

Open `src/app/admin/page.tsx`, find the list of admin links, add:

```tsx
<Link href="/admin/release" className="rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50">
  <p className="text-sm font-semibold">Release new version →</p>
  <p className="mt-1 text-xs text-zinc-500">Bump version + apply accepted proposals + email endorsers.</p>
</Link>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/page.tsx
git commit -m "Link /admin/release from /admin"
```

### Task 4.7: Phase 4 — Done & PR

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: all pass.

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Progress-log entry** following Task 1.5's pattern.

- [ ] **Step 4: Push + open PR**

```bash
git push -u origin HEAD
gh pr create --title "Phase 4: release flow + endorsement-to-signature conversion" --body "Implements phase 4 of \`docs/superpowers/specs/2026-05-19-current-vs-proposed-tabs-design.md\`. /admin/release with bump tier, releaseVersion server action, anchor-stable markdown serialization, endorsement-to-signature email conversion. Full Current vs Proposed feature now end-to-end."
```

---

## Self-review notes (for the engineer)

1. **The `selection-in-anchor` event** triggers on every text selection inside an anchor span. Browsers fire `mouseup` even on small accidental selections; the existing code drops empty/whitespace-only selections, but you may want to debounce / require min length.

2. **Type-narrowing in queries.ts**: `db: any` is used because the lazy-db proxy pattern is already in place. If you switch the queries to a typed `Drizzle` client, the typings should propagate; but stay consistent with the existing file's style.

3. **The `parseDocument` round-trip** in phase 4's release flow is the most fragile spot. Make sure `tests/lib/proposed.serialize-markdown.test.ts` covers your real document. If `parseDocument` ever changes (e.g. supports bold), update `serializeMarkdown` in lock-step.

4. **The "comments persist past release" question** is intentionally NOT handled — per spec, comments on the Current tab are tied to `baseVersionId` and become hidden when a new version ships. They remain in the DB. If you want to surface them in a future "archive comments" admin view, the data is there.

5. **No `reports` table is added in this plan.** Soft-banned signers are gated in the action wrappers; admin can manually hide comments via `/admin/comments`. If abuse becomes a concern, add a `reports` table similar to the closed PR #4's design.

---

*End of plan.*
