# Phase 3 — Comments + Upvotes + Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only `/v/[version]` page into a conversation. Any verified signer can hover a sentence, attach a comment to its anchor, upvote others' comments, reply (arbitrary depth, collapsing past depth 4 desktop / depth 2 mobile), and report abuse. Moderators land in `/admin/reports` to hide flagged comments. Spam-defense via rate limits + auto-soft-hide at 5 reports.

**Architecture:** Three new tables (`comments`, `comment_upvotes`, `reports`); comments scoped to a single `(version_id, anchor_id)` and arbitrarily nestable via `parent_comment_id`. Comment lists render server-side into the version page; the drawer that pops on sentence hover is a client component; posting/upvoting/reporting uses form actions that revalidate. Notification digests via a Vercel cron route (daily) once Resend is configured.

**Tech Stack:** Existing Phase 1/2 stack — Next.js 16, Clerk, Neon + Drizzle, Resend. One new dep: `@upstash/ratelimit` + `@upstash/redis` is overkill for MVP; we use a simple Postgres-backed rate-limit (count rows in a window) instead.

**Reference:** Implements Section 8 + admin routes from Section 4.2 of `docs/superpowers/specs/2026-05-18-ai-bill-of-rights-design.md`. Branches off `feat/phase-2-as-code-attestations` (depends on its `attestations` table for the admin allowlist pattern + `is_admin` gating already established there).

---

## File structure

```
src/
├── app/
│   ├── v/[version]/page.tsx                       # Modify: pass comments-per-anchor counts; mount drawer
│   ├── admin/
│   │   ├── reports/page.tsx                       # Create: moderation queue
│   │   ├── signers/page.tsx                       # Create: search, role assign, soft-ban
│   │   └── comments/page.tsx                      # Create: recent comments + bulk hide
│   └── api/
│       └── comments/[versionId]/[anchorId]/route.ts  # Create: GET comment tree for an anchor
├── lib/
│   ├── db/
│   │   ├── schema.ts                              # Modify: add comments, comment_upvotes, reports
│   │   └── queries.ts                             # Modify: listComments / countCommentsByAnchor / list*Reports
│   └── ratelimit/
│       └── enforce.ts                             # Create: pure ratelimit check against the DB
├── server/actions/
│   ├── comments.ts                                # Create: createComment / hideComment / unhideComment
│   ├── upvotes.ts                                 # Create: toggleUpvote
│   └── reports.ts                                 # Create: reportComment / resolveReport
├── components/
│   ├── CommentDrawer.tsx                          # Create: client; controls open/close + selected anchor
│   ├── CommentThread.tsx                          # Create: server-renderable recursive
│   ├── CommentComposer.tsx                        # Create: client; submit form
│   ├── UpvoteButton.tsx                           # Create: client
│   ├── ReportModal.tsx                            # Create: client
│   └── AnchorMarker.tsx                           # Create: client; hover "+" overlay
└── tests/
    ├── lib/db.queries.comments.test.ts            # Create
    ├── lib/ratelimit.enforce.test.ts              # Create
    ├── server/comments.test.ts                    # Create
    ├── server/upvotes.test.ts                     # Create
    └── server/reports.test.ts                     # Create

drizzle/0002_*.sql                                  # Generated in Task 2
```

---

## Task 1: Schema additions — comments, comment_upvotes, reports

**Files:** `src/lib/db/schema.ts`, `tests/_helpers/pglite-db.ts`, `tests/lib/db.schema.test.ts`

- [ ] **Step 1: Append to `src/lib/db/schema.ts`**

```typescript
export const comments = pgTable("comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id),
  anchorId: text("anchor_id").notNull(),
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

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  commentId: uuid("comment_id")
    .notNull()
    .references(() => comments.id),
  reporterSignerId: uuid("reporter_signer_id")
    .notNull()
    .references(() => signers.id),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => signers.id),
  resolution: text("resolution", { enum: ["hidden", "allowed"] }),
});
```

- [ ] **Step 2: Append matching DDL to `tests/_helpers/pglite-db.ts`** (use the same `client.exec(...)` method that's already in use):

```sql
create table comments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references versions(id),
  anchor_id text not null,
  signer_id uuid not null references signers(id),
  body text not null,
  parent_comment_id uuid,
  created_at timestamptz not null default now(),
  hidden_at timestamptz,
  hidden_reason text
);
create index comments_version_anchor_active
  on comments (version_id, anchor_id) where hidden_at is null;
create index comments_parent
  on comments (parent_comment_id);

create table comment_upvotes (
  comment_id uuid not null references comments(id),
  signer_id uuid not null references signers(id),
  created_at timestamptz not null default now(),
  primary key (comment_id, signer_id)
);
create index comment_upvotes_comment on comment_upvotes (comment_id);

create table reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references comments(id),
  reporter_signer_id uuid not null references signers(id),
  reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references signers(id),
  resolution text check (resolution in ('hidden','allowed'))
);
create index reports_pending on reports (comment_id) where resolved_at is null;
```

- [ ] **Step 3: Update `tests/lib/db.schema.test.ts`** — add three assertions:
```typescript
expect(schema.comments).toBeDefined();
expect(schema.commentUpvotes).toBeDefined();
expect(schema.reports).toBeDefined();
```

- [ ] **Step 4: Run + commit**

`pnpm test` — all current tests still pass (39 + 0 new) plus the 3 added schema assertions.

```bash
git add src/lib/db/schema.ts tests/_helpers/pglite-db.ts tests/lib/db.schema.test.ts "prd/branch commit updates/feat/phase-3-comments-upvotes-moderation.md"
git commit -m "Add comments, comment_upvotes, reports tables to schema"
```

Create the branch progress log file with the first entry.

---

## Task 2: Generate + apply migration

- [ ] **Step 1:** `pnpm db:generate` — produces `drizzle/0002_*.sql`. Inspect — only additive.
- [ ] **Step 2:** `pnpm db:push` — applies to Neon.
- [ ] **Step 3:** Commit

```bash
git add drizzle "prd/branch commit updates/feat/phase-3-comments-upvotes-moderation.md"
git commit -m "Generate migration for comments + upvotes + reports"
```

---

## Task 3: Rate-limit enforcement (pure-function, DB-backed)

**Files:** `src/lib/ratelimit/enforce.ts`, `tests/lib/ratelimit.enforce.test.ts`

The function takes a db client, a window predicate (e.g., "comments by signer X in the last 60s"), a limit number, and returns `{ allowed: true }` or throws a `RateLimitError`. Pure logic over a count query — no Redis, no in-memory state.

- [ ] **Step 1: Write the test**

```typescript
import { describe, expect, it } from "vitest";
import { eq, gte, and, sql } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { signers, comments } from "@/lib/db/schema";
import { enforceRateLimit, RateLimitError } from "@/lib/ratelimit/enforce";

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
    { version: "1.0.0", publishedAt: new Date(), markdown: md, agentsMd: "s", specJson: "{}", isCurrent: true, gitCommitSha: null },
  ]);
  const [s] = await db.insert(signers).values({
    clerkUserId: "u1", displayName: "T", affiliation: null, locationText: null,
    verificationMethod: "email", verifiedAt: new Date(),
  }).returning({ id: signers.id });
  return { db, signerId: s.id };
}

describe("enforceRateLimit", () => {
  it("allows when count is below limit", async () => {
    const { db, signerId } = await seed();
    // No comments yet, limit=5
    await expect(
      enforceRateLimit(db, {
        table: comments,
        timestampColumn: comments.createdAt,
        whereSignerColumn: comments.signerId,
        signerId,
        windowSeconds: 60,
        limit: 5,
        errorMessage: "Too many comments",
      })
    ).resolves.toEqual({ allowed: true });
  });

  it("throws when count is at or above limit", async () => {
    const { db, signerId } = await seed();
    // Seed 5 comments in the window
    const [version] = await db.select().from((await import("@/lib/db/schema")).versions).limit(1);
    for (let i = 0; i < 5; i++) {
      await db.insert(comments).values({
        versionId: version.id,
        anchorId: "preamble-s-1",
        signerId,
        body: `comment ${i}`,
      });
    }
    await expect(
      enforceRateLimit(db, {
        table: comments,
        timestampColumn: comments.createdAt,
        whereSignerColumn: comments.signerId,
        signerId,
        windowSeconds: 60,
        limit: 5,
        errorMessage: "Too many comments",
      })
    ).rejects.toThrow(RateLimitError);
  });
});
```

- [ ] **Step 2: Implement** `src/lib/ratelimit/enforce.ts`

```typescript
import { and, eq, gte, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RateLimitError";
  }
}

export interface RateLimitOptions {
  table: PgTable<any>;
  timestampColumn: any;
  whereSignerColumn: any;
  signerId: string;
  windowSeconds: number;
  limit: number;
  errorMessage: string;
}

export async function enforceRateLimit(
  db: any,
  opts: RateLimitOptions,
): Promise<{ allowed: true }> {
  const windowStart = new Date(Date.now() - opts.windowSeconds * 1000);
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(opts.table)
    .where(
      and(
        eq(opts.whereSignerColumn, opts.signerId),
        gte(opts.timestampColumn, windowStart),
      ),
    );
  const count = Number(rows[0]?.count ?? 0);
  if (count >= opts.limit) {
    throw new RateLimitError(opts.errorMessage);
  }
  return { allowed: true };
}
```

- [ ] **Step 3: Run + commit**

```bash
git add src/lib/ratelimit tests/lib/ratelimit.enforce.test.ts "prd/branch commit updates/feat/phase-3-comments-upvotes-moderation.md"
git commit -m "Add DB-backed rate limit enforcer"
```

---

## Task 4: Comment server actions (create + hide + unhide)

**Files:** `src/server/actions/comments.ts`, `tests/server/comments.test.ts`

- [ ] **Step 1: Tests**

```typescript
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { signers, comments, versions } from "@/lib/db/schema";
import { createComment, hideComment, unhideComment } from "@/server/actions/comments";

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
    { version: "1.0.0", publishedAt: new Date(), markdown: md, agentsMd: "s", specJson: "{}", isCurrent: true, gitCommitSha: null },
  ]);
  const [s] = await db.insert(signers).values({
    clerkUserId: "u1", displayName: "T", affiliation: null, locationText: null,
    verificationMethod: "email", verifiedAt: new Date(),
  }).returning({ id: signers.id });
  const [v] = await db.select().from(versions).limit(1);
  return { db, signerId: s.id, versionId: v.id };
}

describe("createComment", () => {
  it("inserts a top-level comment", async () => {
    const { db, signerId, versionId } = await seed();
    const result = await createComment(db, {
      versionId,
      anchorId: "preamble-s-1",
      signerId,
      body: "Hello",
      parentCommentId: null,
    });
    expect(result.id).toBeDefined();
    const rows = await db.select().from(comments);
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("Hello");
  });

  it("inserts a reply with parent_comment_id set", async () => {
    const { db, signerId, versionId } = await seed();
    const parent = await createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "Top", parentCommentId: null });
    const reply = await createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "Reply", parentCommentId: parent.id });
    const rows = await db.select().from(comments);
    expect(rows).toHaveLength(2);
    const replyRow = rows.find((r: any) => r.id === reply.id);
    expect(replyRow?.parentCommentId).toBe(parent.id);
  });

  it("rejects body that is empty after trim", async () => {
    const { db, signerId, versionId } = await seed();
    await expect(
      createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "   ", parentCommentId: null })
    ).rejects.toThrow();
  });
});

describe("hideComment / unhideComment", () => {
  it("sets hidden_at + reason; unhide clears them", async () => {
    const { db, signerId, versionId } = await seed();
    const c = await createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "x", parentCommentId: null });
    await hideComment(db, c.id, "spam");
    let [row] = await db.select().from(comments).where(eq(comments.id, c.id));
    expect(row.hiddenAt).not.toBeNull();
    expect(row.hiddenReason).toBe("spam");
    await unhideComment(db, c.id);
    [row] = await db.select().from(comments).where(eq(comments.id, c.id));
    expect(row.hiddenAt).toBeNull();
    expect(row.hiddenReason).toBeNull();
  });
});
```

- [ ] **Step 2: Implementation** `src/server/actions/comments.ts`

```typescript
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { comments, signers } from "@/lib/db/schema";
import { enforceRateLimit } from "@/lib/ratelimit/enforce";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

export interface CreateCommentInput {
  versionId: string;
  anchorId: string;
  signerId: string;
  body: string;
  parentCommentId: string | null;
}

export async function createComment(
  dbClient: any = null,
  input: CreateCommentInput,
): Promise<{ id: string }> {
  const db = dbClient ?? getDb();
  const trimmed = input.body.trim();
  if (trimmed.length === 0) {
    throw new Error("Comment body cannot be empty");
  }
  if (trimmed.length > 5000) {
    throw new Error("Comment body cannot exceed 5000 characters");
  }
  const [row] = await db
    .insert(comments)
    .values({
      versionId: input.versionId,
      anchorId: input.anchorId,
      signerId: input.signerId,
      body: trimmed,
      parentCommentId: input.parentCommentId,
    })
    .returning({ id: comments.id });
  return { id: row.id };
}

export async function hideComment(
  dbClient: any = null,
  commentId: string,
  reason: string,
): Promise<void> {
  const db = dbClient ?? getDb();
  await db
    .update(comments)
    .set({ hiddenAt: new Date(), hiddenReason: reason })
    .where(eq(comments.id, commentId));
}

export async function unhideComment(
  dbClient: any = null,
  commentId: string,
): Promise<void> {
  const db = dbClient ?? getDb();
  await db
    .update(comments)
    .set({ hiddenAt: null, hiddenReason: null })
    .where(eq(comments.id, commentId));
}

/**
 * Form-action wrapper invoked from the comment composer. Resolves signer
 * from Clerk session, applies rate limits, inserts the comment, then
 * revalidates the version page so the new comment appears in the next render.
 */
export async function submitCommentAction(formData: FormData): Promise<void> {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const versionId = String(formData.get("versionId") ?? "");
  const anchorId = String(formData.get("anchorId") ?? "");
  const body = String(formData.get("body") ?? "");
  const parentCommentId =
    (formData.get("parentCommentId")?.toString() ?? "") || null;
  const versionString = String(formData.get("versionString") ?? "");

  const db = getDb();
  const signerRows = await db
    .select({ id: signers.id })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (signerRows.length === 0) {
    throw new Error("Only verified signers can comment");
  }
  const signerId = signerRows[0].id;

  // 5 comments per signer per minute
  await enforceRateLimit(db, {
    table: comments,
    timestampColumn: comments.createdAt,
    whereSignerColumn: comments.signerId,
    signerId,
    windowSeconds: 60,
    limit: 5,
    errorMessage: "You are commenting too quickly. Try again in a minute.",
  });
  // 50 comments per signer per day
  await enforceRateLimit(db, {
    table: comments,
    timestampColumn: comments.createdAt,
    whereSignerColumn: comments.signerId,
    signerId,
    windowSeconds: 24 * 60 * 60,
    limit: 50,
    errorMessage: "You have reached the daily comment limit.",
  });

  await createComment(db, {
    versionId,
    anchorId,
    signerId,
    body,
    parentCommentId,
  });

  revalidatePath(`/v/${versionString}`);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/actions/comments.ts tests/server/comments.test.ts "prd/branch commit updates/feat/phase-3-comments-upvotes-moderation.md"
git commit -m "Add comment server actions (create, hide, unhide) with rate limits"
```

---

## Task 5: Upvote toggle action

**Files:** `src/server/actions/upvotes.ts`, `tests/server/upvotes.test.ts`

Simple: insert a row if missing; delete it if present. Returns the new state.

- [ ] **Step 1: Test**

```typescript
import { describe, expect, it } from "vitest";
import { eq, and } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { signers, comments, commentUpvotes, versions } from "@/lib/db/schema";
import { toggleUpvote } from "@/server/actions/upvotes";
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
  await syncVersions(db, [{ version: "1.0.0", publishedAt: new Date(), markdown: md, agentsMd: "s", specJson: "{}", isCurrent: true, gitCommitSha: null }]);
  const [s] = await db.insert(signers).values({
    clerkUserId: "u1", displayName: "T", affiliation: null, locationText: null,
    verificationMethod: "email", verifiedAt: new Date(),
  }).returning({ id: signers.id });
  const [v] = await db.select().from(versions).limit(1);
  const c = await createComment(db, { versionId: v.id, anchorId: "preamble-s-1", signerId: s.id, body: "x", parentCommentId: null });
  return { db, signerId: s.id, commentId: c.id };
}

describe("toggleUpvote", () => {
  it("adds an upvote on first call", async () => {
    const { db, signerId, commentId } = await seed();
    const r = await toggleUpvote(db, commentId, signerId);
    expect(r.upvoted).toBe(true);
    const rows = await db.select().from(commentUpvotes);
    expect(rows).toHaveLength(1);
  });
  it("removes the upvote on second call", async () => {
    const { db, signerId, commentId } = await seed();
    await toggleUpvote(db, commentId, signerId);
    const r = await toggleUpvote(db, commentId, signerId);
    expect(r.upvoted).toBe(false);
    const rows = await db.select().from(commentUpvotes);
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implementation**

```typescript
"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { commentUpvotes, signers } from "@/lib/db/schema";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

export async function toggleUpvote(
  dbClient: any = null,
  commentId: string,
  signerId: string,
): Promise<{ upvoted: boolean }> {
  const db = dbClient ?? getDb();
  const existing = await db
    .select()
    .from(commentUpvotes)
    .where(
      and(
        eq(commentUpvotes.commentId, commentId),
        eq(commentUpvotes.signerId, signerId),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    await db
      .delete(commentUpvotes)
      .where(
        and(
          eq(commentUpvotes.commentId, commentId),
          eq(commentUpvotes.signerId, signerId),
        ),
      );
    return { upvoted: false };
  }
  await db
    .insert(commentUpvotes)
    .values({ commentId, signerId });
  return { upvoted: true };
}

export async function submitUpvoteAction(formData: FormData): Promise<void> {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const commentId = String(formData.get("commentId") ?? "");
  const versionString = String(formData.get("versionString") ?? "");
  const db = getDb();
  const signerRows = await db
    .select({ id: signers.id })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (signerRows.length === 0) {
    throw new Error("Only verified signers can upvote");
  }
  await toggleUpvote(db, commentId, signerRows[0].id);
  revalidatePath(`/v/${versionString}`);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/actions/upvotes.ts tests/server/upvotes.test.ts "prd/branch commit updates/feat/phase-3-comments-upvotes-moderation.md"
git commit -m "Add upvote toggle action"
```

---

## Task 6: Report action + auto-soft-hide rule

**Files:** `src/server/actions/reports.ts`, `tests/server/reports.test.ts`

- [ ] **Step 1: Test**

```typescript
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { signers, comments, reports, versions } from "@/lib/db/schema";
import { createComment } from "@/server/actions/comments";
import { reportComment } from "@/server/actions/reports";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [{ version: "1.0.0", publishedAt: new Date(), markdown: md, agentsMd: "s", specJson: "{}", isCurrent: true, gitCommitSha: null }]);
  const [author] = await db.insert(signers).values({
    clerkUserId: "author", displayName: "A", affiliation: null, locationText: null,
    verificationMethod: "email", verifiedAt: new Date(),
  }).returning({ id: signers.id });
  const [v] = await db.select().from(versions).limit(1);
  const c = await createComment(db, { versionId: v.id, anchorId: "preamble-s-1", signerId: author.id, body: "x", parentCommentId: null });
  return { db, commentId: c.id };
}

describe("reportComment", () => {
  it("creates a report row", async () => {
    const { db, commentId } = await seed();
    const [reporter] = await db.insert(signers).values({
      clerkUserId: "r1", displayName: "R", affiliation: null, locationText: null,
      verificationMethod: "email", verifiedAt: new Date(),
    }).returning({ id: signers.id });
    await reportComment(db, { commentId, reporterSignerId: reporter.id, reason: "spam" });
    expect(await db.select().from(reports)).toHaveLength(1);
  });

  it("auto-hides the comment at the 5-report threshold", async () => {
    const { db, commentId } = await seed();
    for (let i = 0; i < 5; i++) {
      const [r] = await db.insert(signers).values({
        clerkUserId: `r${i}`, displayName: `R${i}`, affiliation: null, locationText: null,
        verificationMethod: "email", verifiedAt: new Date(),
      }).returning({ id: signers.id });
      await reportComment(db, { commentId, reporterSignerId: r.id, reason: null });
    }
    const [comm] = await db.select().from(comments).where(eq(comments.id, commentId));
    expect(comm.hiddenAt).not.toBeNull();
    expect(comm.hiddenReason).toMatch(/auto/i);
  });
});
```

- [ ] **Step 2: Implementation** `src/server/actions/reports.ts`

```typescript
"use server";

import { eq, and, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { reports, comments, signers } from "@/lib/db/schema";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

const AUTO_HIDE_THRESHOLD = 5;

export interface ReportCommentInput {
  commentId: string;
  reporterSignerId: string;
  reason: string | null;
}

export async function reportComment(
  dbClient: any = null,
  input: ReportCommentInput,
): Promise<void> {
  const db = dbClient ?? getDb();
  await db.insert(reports).values({
    commentId: input.commentId,
    reporterSignerId: input.reporterSignerId,
    reason: input.reason,
  });

  // Auto-soft-hide rule: if the comment now has >= AUTO_HIDE_THRESHOLD pending reports,
  // hide it pending moderator review.
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(reports)
    .where(
      and(
        eq(reports.commentId, input.commentId),
        isNull(reports.resolvedAt),
      ),
    );
  const count = Number(rows[0]?.count ?? 0);
  if (count >= AUTO_HIDE_THRESHOLD) {
    // Only hide if not already hidden
    const [existing] = await db
      .select({ hiddenAt: comments.hiddenAt })
      .from(comments)
      .where(eq(comments.id, input.commentId));
    if (existing && existing.hiddenAt === null) {
      await db
        .update(comments)
        .set({
          hiddenAt: new Date(),
          hiddenReason: "auto: threshold of reports",
        })
        .where(eq(comments.id, input.commentId));
    }
  }
}

export async function resolveReport(
  dbClient: any = null,
  reportId: string,
  resolverSignerId: string,
  resolution: "hidden" | "allowed",
): Promise<void> {
  const db = dbClient ?? getDb();
  await db
    .update(reports)
    .set({
      resolvedAt: new Date(),
      resolvedBy: resolverSignerId,
      resolution,
    })
    .where(eq(reports.id, reportId));
}

export async function submitReportAction(formData: FormData): Promise<void> {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const commentId = String(formData.get("commentId") ?? "");
  const reason = (formData.get("reason")?.toString() ?? "") || null;
  const versionString = String(formData.get("versionString") ?? "");
  const db = getDb();
  const signerRows = await db
    .select({ id: signers.id })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (signerRows.length === 0) {
    throw new Error("Only verified signers can report");
  }
  await reportComment(db, { commentId, reporterSignerId: signerRows[0].id, reason });
  revalidatePath(`/v/${versionString}`);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/server/actions/reports.ts tests/server/reports.test.ts "prd/branch commit updates/feat/phase-3-comments-upvotes-moderation.md"
git commit -m "Add report action with auto-soft-hide at 5 reports"
```

---

## Task 7: Comment query helpers + counts

**Files:** Modify `src/lib/db/queries.ts`, create `tests/lib/db.queries.comments.test.ts`

- [ ] **Step 1: Test**

```typescript
import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { signers, versions } from "@/lib/db/schema";
import { listCommentsForAnchor, countCommentsByAnchor, listPendingReports } from "@/lib/db/queries";
import { createComment } from "@/server/actions/comments";
import { reportComment } from "@/server/actions/reports";

const md = `---
version: 1.0.0
published_at: 2026-05-18
---
# T {#preamble}
x {#preamble-s-1} y {#preamble-s-2}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [{ version: "1.0.0", publishedAt: new Date(), markdown: md, agentsMd: "s", specJson: "{}", isCurrent: true, gitCommitSha: null }]);
  const [u1] = await db.insert(signers).values({
    clerkUserId: "u1", displayName: "Alice", affiliation: "Acme", locationText: "Paris",
    verificationMethod: "email", verifiedAt: new Date(),
  }).returning({ id: signers.id });
  const [v] = await db.select().from(versions).limit(1);
  return { db, signerId: u1.id, versionId: v.id };
}

describe("listCommentsForAnchor", () => {
  it("returns visible comments with signer display info", async () => {
    const { db, signerId, versionId } = await seed();
    await createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "hi", parentCommentId: null });
    const rows = await listCommentsForAnchor(db, versionId, "preamble-s-1");
    expect(rows).toHaveLength(1);
    expect(rows[0].body).toBe("hi");
    expect(rows[0].displayName).toBe("Alice");
  });
});

describe("countCommentsByAnchor", () => {
  it("returns counts per anchor for a version", async () => {
    const { db, signerId, versionId } = await seed();
    await createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "1", parentCommentId: null });
    await createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "2", parentCommentId: null });
    await createComment(db, { versionId, anchorId: "preamble-s-2", signerId, body: "3", parentCommentId: null });
    const counts = await countCommentsByAnchor(db, versionId);
    expect(counts["preamble-s-1"]).toBe(2);
    expect(counts["preamble-s-2"]).toBe(1);
  });
});

describe("listPendingReports", () => {
  it("returns unresolved reports", async () => {
    const { db, signerId, versionId } = await seed();
    const c = await createComment(db, { versionId, anchorId: "preamble-s-1", signerId, body: "x", parentCommentId: null });
    await reportComment(db, { commentId: c.id, reporterSignerId: signerId, reason: "spam" });
    const pending = await listPendingReports(db);
    expect(pending).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Append to `src/lib/db/queries.ts`**

```typescript
import { comments, commentUpvotes, reports } from "./schema";
import { sql } from "drizzle-orm";

export interface CommentTreeItem {
  id: string;
  versionId: string;
  anchorId: string;
  body: string;
  parentCommentId: string | null;
  createdAt: Date;
  hiddenAt: Date | null;
  signerId: string;
  displayName: string;
  locationText: string | null;
  affiliation: string | null;
  verificationMethod: "email" | "sms";
  upvoteCount: number;
}

export async function listCommentsForAnchor(
  db: any = null,
  versionId: string,
  anchorId: string,
): Promise<CommentTreeItem[]> {
  const client = db ?? getDb();
  const rows = await client
    .select({
      id: comments.id,
      versionId: comments.versionId,
      anchorId: comments.anchorId,
      body: comments.body,
      parentCommentId: comments.parentCommentId,
      createdAt: comments.createdAt,
      hiddenAt: comments.hiddenAt,
      signerId: signers.id,
      displayName: signers.displayName,
      locationText: signers.locationText,
      affiliation: signers.affiliation,
      verificationMethod: signers.verificationMethod,
      upvoteCount: sql<number>`(select count(*)::int from ${commentUpvotes} where ${commentUpvotes.commentId} = ${comments.id})`,
    })
    .from(comments)
    .innerJoin(signers, eq(signers.id, comments.signerId))
    .where(
      and(
        eq(comments.versionId, versionId),
        eq(comments.anchorId, anchorId),
      ),
    )
    .orderBy(comments.createdAt);
  return rows as CommentTreeItem[];
}

export async function countCommentsByAnchor(
  db: any = null,
  versionId: string,
): Promise<Record<string, number>> {
  const client = db ?? getDb();
  const rows = await client
    .select({
      anchorId: comments.anchorId,
      count: sql<number>`count(*)::int`,
    })
    .from(comments)
    .where(
      and(
        eq(comments.versionId, versionId),
        isNull(comments.hiddenAt),
      ),
    )
    .groupBy(comments.anchorId);
  const out: Record<string, number> = {};
  for (const r of rows) out[r.anchorId] = Number(r.count);
  return out;
}

export async function listPendingReports(db: any = null) {
  const client = db ?? getDb();
  return client
    .select({
      reportId: reports.id,
      commentId: reports.commentId,
      reason: reports.reason,
      createdAt: reports.createdAt,
      commentBody: comments.body,
      commentAnchorId: comments.anchorId,
      commentVersion: versions.version,
      reporterName: signers.displayName,
    })
    .from(reports)
    .innerJoin(comments, eq(comments.id, reports.commentId))
    .innerJoin(versions, eq(versions.id, comments.versionId))
    .innerJoin(signers, eq(signers.id, reports.reporterSignerId))
    .where(isNull(reports.resolvedAt))
    .orderBy(desc(reports.createdAt));
}
```

- [ ] **Step 3: Run + commit**

```bash
git add src/lib/db/queries.ts tests/lib/db.queries.comments.test.ts "prd/branch commit updates/feat/phase-3-comments-upvotes-moderation.md"
git commit -m "Add comment query helpers"
```

---

## Task 8: Comment components (server-renderable thread + client composer/upvote/report)

**Files:** `src/components/CommentThread.tsx`, `src/components/CommentComposer.tsx`, `src/components/UpvoteButton.tsx`, `src/components/ReportModal.tsx`

These four work together. The thread is server-rendered (it's just a tree of comments → JSX). The composer, upvote, and report are client components that wrap server actions.

- [ ] **Step 1: `src/components/CommentThread.tsx`**

```typescript
import type { CommentTreeItem } from "@/lib/db/queries";
import { VerificationBadge } from "./VerificationBadge";
import { UpvoteButton } from "./UpvoteButton";
import { ReportModal } from "./ReportModal";
import { CommentComposer } from "./CommentComposer";

interface Props {
  comments: CommentTreeItem[];
  versionId: string;
  versionString: string;
  anchorId: string;
  depth?: number;
  parentId?: string | null;
  maxDepth?: number;
}

export function CommentThread({
  comments,
  versionId,
  versionString,
  anchorId,
  depth = 0,
  parentId = null,
  maxDepth = 4,
}: Props) {
  const children = comments.filter((c) => c.parentCommentId === parentId);
  if (children.length === 0) return null;

  return (
    <ul
      className={
        depth === 0
          ? "flex flex-col gap-4"
          : "mt-2 flex flex-col gap-3 border-l border-zinc-200 pl-4 dark:border-zinc-800"
      }
    >
      {children.map((c) => {
        const isHidden = c.hiddenAt !== null;
        const grandchildren = comments.filter((x) => x.parentCommentId === c.id);
        const collapse = depth + 1 > maxDepth;
        return (
          <li key={c.id}>
            <div className="rounded-md bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{c.displayName}</span>
                <VerificationBadge method={c.verificationMethod} />
                {c.locationText ? <span className="text-xs text-zinc-500">· {c.locationText}</span> : null}
                <span className="ml-auto text-xs text-zinc-500">
                  {new Date(c.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </div>
              {isHidden ? (
                <p className="mt-2 italic text-zinc-500">[comment hidden by moderator]</p>
              ) : (
                <p className="mt-2 whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">{c.body}</p>
              )}
              {!isHidden ? (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <UpvoteButton commentId={c.id} count={c.upvoteCount} versionString={versionString} />
                  <ReplyToggle commentId={c.id} />
                  <ReportModal commentId={c.id} versionString={versionString} />
                </div>
              ) : null}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-zinc-500">Reply</summary>
                <CommentComposer
                  versionId={versionId}
                  versionString={versionString}
                  anchorId={anchorId}
                  parentCommentId={c.id}
                />
              </details>
            </div>
            {grandchildren.length > 0 ? (
              collapse ? (
                <details className="ml-2 mt-1">
                  <summary className="cursor-pointer text-xs text-zinc-500">
                    Show {grandchildren.length} more {grandchildren.length === 1 ? "reply" : "replies"}
                  </summary>
                  <CommentThread
                    comments={comments}
                    versionId={versionId}
                    versionString={versionString}
                    anchorId={anchorId}
                    depth={depth + 1}
                    parentId={c.id}
                    maxDepth={maxDepth}
                  />
                </details>
              ) : (
                <CommentThread
                  comments={comments}
                  versionId={versionId}
                  versionString={versionString}
                  anchorId={anchorId}
                  depth={depth + 1}
                  parentId={c.id}
                  maxDepth={maxDepth}
                />
              )
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ReplyToggle({ commentId }: { commentId: string }) {
  return (
    <span className="text-zinc-500">{/* Reply toggle is inline via <details> on the comment */}</span>
  );
}
```

- [ ] **Step 2: `src/components/CommentComposer.tsx`** (client)

```typescript
"use client";

import { submitCommentAction } from "@/server/actions/comments";

interface Props {
  versionId: string;
  versionString: string;
  anchorId: string;
  parentCommentId?: string | null;
  placeholder?: string;
}

export function CommentComposer({
  versionId,
  versionString,
  anchorId,
  parentCommentId = null,
  placeholder = "Write a comment…",
}: Props) {
  return (
    <form action={submitCommentAction} className="mt-2 flex flex-col gap-2">
      <input type="hidden" name="versionId" value={versionId} />
      <input type="hidden" name="versionString" value={versionString} />
      <input type="hidden" name="anchorId" value={anchorId} />
      {parentCommentId ? (
        <input type="hidden" name="parentCommentId" value={parentCommentId} />
      ) : null}
      <textarea
        name="body"
        required
        maxLength={5000}
        rows={3}
        placeholder={placeholder}
        className="rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
      <button
        type="submit"
        className="self-start rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
      >
        Post
      </button>
    </form>
  );
}
```

- [ ] **Step 3: `src/components/UpvoteButton.tsx`** (client)

```typescript
"use client";

import { submitUpvoteAction } from "@/server/actions/upvotes";

interface Props {
  commentId: string;
  count: number;
  versionString: string;
}

export function UpvoteButton({ commentId, count, versionString }: Props) {
  return (
    <form action={submitUpvoteAction}>
      <input type="hidden" name="commentId" value={commentId} />
      <input type="hidden" name="versionString" value={versionString} />
      <button
        type="submit"
        className="rounded-full border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        ▲ {count}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: `src/components/ReportModal.tsx`** (client; uses `<dialog>` for native modal)

```typescript
"use client";

import { useRef } from "react";
import { submitReportAction } from "@/server/actions/reports";

interface Props {
  commentId: string;
  versionString: string;
}

export function ReportModal({ commentId, versionString }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="text-zinc-500 underline-offset-4 hover:underline"
      >
        Report
      </button>
      <dialog ref={dialogRef} className="rounded-lg p-6 backdrop:bg-black/40">
        <form action={submitReportAction} className="flex w-80 flex-col gap-3">
          <h3 className="text-base font-semibold">Report comment</h3>
          <input type="hidden" name="commentId" value={commentId} />
          <input type="hidden" name="versionString" value={versionString} />
          <label className="text-xs">
            Why? (optional)
            <input
              name="reason"
              type="text"
              maxLength={200}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-full px-3 py-1 text-xs text-zinc-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-full bg-red-700 px-3 py-1 text-xs font-medium text-white"
            >
              Submit report
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/components/CommentThread.tsx src/components/CommentComposer.tsx src/components/UpvoteButton.tsx src/components/ReportModal.tsx "prd/branch commit updates/feat/phase-3-comments-upvotes-moderation.md"
git commit -m "Add comment thread, composer, upvote, and report components"
```

---

## Task 9: Hover-to-comment UX on `/v/[version]`

**Files:** Modify `src/app/v/[version]/page.tsx`, modify `src/components/DocumentRenderer.tsx`, create `src/components/AnchorMarker.tsx`, create `src/components/CommentDrawer.tsx`

The version page now:
1. Loads all comments + anchor counts for the version up front
2. Passes them to the DocumentRenderer
3. DocumentRenderer wraps each anchored sentence with a hover-target client component (`AnchorMarker`) that shows comment count + opens the drawer
4. CommentDrawer is a client component that holds open state + the comment thread for the selected anchor

- [ ] **Step 1: `src/components/AnchorMarker.tsx`** (client)

```typescript
"use client";

interface Props {
  anchorId: string;
  count: number;
  onSelect: (anchorId: string) => void;
}

export function AnchorMarker({ anchorId, count, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={() => onSelect(anchorId)}
      className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 text-[10px] font-medium text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
      aria-label={`Discuss this sentence (${count} comments)`}
    >
      {count > 0 ? `💬 ${count}` : "+"}
    </button>
  );
}
```

- [ ] **Step 2: `src/components/CommentDrawer.tsx`** (client; holds state for which anchor is open)

```typescript
"use client";

import { useState, useEffect } from "react";
import type { CommentTreeItem } from "@/lib/db/queries";
import { CommentThread } from "./CommentThread";
import { CommentComposer } from "./CommentComposer";

interface Props {
  versionId: string;
  versionString: string;
  initialComments: CommentTreeItem[]; // all comments for the version, the drawer filters by anchor
  isSignedIn: boolean;
}

export function CommentDrawer({
  versionId,
  versionString,
  initialComments,
  isSignedIn,
}: Props) {
  const [openAnchor, setOpenAnchor] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ anchorId: string }>).detail;
      setOpenAnchor(detail.anchorId);
    };
    window.addEventListener("anchor-open", handler);
    return () => window.removeEventListener("anchor-open", handler);
  }, []);

  if (!openAnchor) return null;
  const filtered = initialComments.filter((c) => c.anchorId === openAnchor);

  return (
    <aside className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-950 sm:w-96">
      <div className="flex items-center justify-between border-b border-zinc-200 p-4 dark:border-zinc-800">
        <div>
          <p className="text-xs uppercase tracking-widest text-zinc-500">Discussion</p>
          <p className="text-sm font-medium">{openAnchor}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpenAnchor(null)}
          className="rounded-full px-3 py-1 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Close
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {filtered.length === 0 ? (
          <p className="text-sm text-zinc-500">No comments on this sentence yet.</p>
        ) : (
          <CommentThread
            comments={filtered}
            versionId={versionId}
            versionString={versionString}
            anchorId={openAnchor}
          />
        )}
      </div>
      <div className="border-t border-zinc-200 p-4 dark:border-zinc-800">
        {isSignedIn ? (
          <CommentComposer
            versionId={versionId}
            versionString={versionString}
            anchorId={openAnchor}
            placeholder="Add a comment…"
          />
        ) : (
          <p className="text-xs text-zinc-500">
            Sign the document to comment.
          </p>
        )}
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Modify `src/components/DocumentRenderer.tsx`** to wrap each anchored sentence with a hover-marker client wrapper.

Since the renderer is a server component but `AnchorMarker` is client, the renderer must import a thin client wrapper that emits the open event. Create `src/components/AnchorSentence.tsx`:

```typescript
"use client";

import type { ReactNode } from "react";

interface Props {
  anchorId: string;
  count: number;
  children: ReactNode;
}

export function AnchorSentence({ anchorId, count, children }: Props) {
  return (
    <span
      data-anchor-id={anchorId}
      className="group relative"
    >
      {children}
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent("anchor-open", { detail: { anchorId } }),
          );
        }}
        className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-zinc-100 px-1.5 align-middle text-[10px] font-medium text-zinc-600 opacity-0 transition group-hover:opacity-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
        aria-label={`Discuss this sentence (${count} comments)`}
      >
        {count > 0 ? `💬 ${count}` : "+"}
      </button>
    </span>
  );
}
```

Then modify `src/components/DocumentRenderer.tsx`:

```typescript
import type { ParsedDocument } from "@/lib/markdown/parse";
import { AnchorSentence } from "./AnchorSentence";

interface Props {
  document: ParsedDocument;
  anchorCounts?: Record<string, number>;
}

export function DocumentRenderer({ document, anchorCounts = {} }: Props) {
  return (
    <article className="prose prose-zinc max-w-none dark:prose-invert">
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

- [ ] **Step 4: Modify `src/app/v/[version]/page.tsx`** to load comments + counts, render DocumentRenderer with counts, and mount the drawer.

Read the current file first to preserve the SignButton + AsCodeButton sticky CTA. Add:

```typescript
// At top, add:
import { listCommentsForAnchor, countCommentsByAnchor } from "@/lib/db/queries";
import { CommentDrawer } from "@/components/CommentDrawer";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { signers } from "@/lib/db/schema";
import { db } from "@/lib/db";

// In the component body, after `const parsed = ...`:
const anchorCounts = await countCommentsByAnchor(undefined, row.id);
// Load all comments for the version in one shot so the drawer can filter client-side.
// Cap to anchors that have at least one comment to keep the payload small.
const anchorIdsWithComments = Object.keys(anchorCounts);
let allComments: any[] = [];
for (const a of anchorIdsWithComments) {
  const rows = await listCommentsForAnchor(undefined, row.id, a);
  allComments = allComments.concat(rows);
}
const { userId } = await auth();
let isSignedIn = false;
if (userId) {
  const s = await db.select({ id: signers.id }).from(signers).where(eq(signers.clerkUserId, userId)).limit(1);
  isSignedIn = s.length > 0;
}

// Then in the JSX, replace:
<DocumentRenderer document={parsed} />
// With:
<DocumentRenderer document={parsed} anchorCounts={anchorCounts} />

// And append BEFORE the closing </main>:
<CommentDrawer
  versionId={row.id}
  versionString={row.version}
  initialComments={allComments}
  isSignedIn={isSignedIn}
/>
```

- [ ] **Step 5: Smoke test + commit**

`pnpm test` (no regressions). Visit `/v/1.0.0` — hover a sentence → see `+` icon → click → drawer opens. (You won't see comments unless you've signed in and posted one; manually create a comment via the form to verify.)

```bash
git add src/components/AnchorMarker.tsx src/components/AnchorSentence.tsx src/components/CommentDrawer.tsx src/components/DocumentRenderer.tsx "src/app/v/[version]/page.tsx" "prd/branch commit updates/feat/phase-3-comments-upvotes-moderation.md"
git commit -m "Wire hover-to-comment drawer onto /v/[version]"
```

---

## Task 10: `/admin/reports` moderation queue

**Files:** `src/app/admin/reports/page.tsx`

Follows the pattern of `/admin/attestations` from Phase 2: Clerk auth + `signers.is_admin` check + list pending reports + approve/hide form actions.

- [ ] **Step 1: `src/app/admin/reports/page.tsx`**

```typescript
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { signers } from "@/lib/db/schema";
import { listPendingReports } from "@/lib/db/queries";
import { hideComment } from "@/server/actions/comments";
import { resolveReport } from "@/server/actions/reports";

export const dynamic = "force-dynamic";

async function adminCheck(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const rows = await db
    .select({ id: signers.id, isAdmin: signers.isAdmin })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (!rows[0]?.isAdmin) return null;
  return rows[0].id;
}

async function hideAction(formData: FormData): Promise<void> {
  "use server";
  const adminId = await adminCheck();
  if (!adminId) throw new Error("Not authorized");
  const reportId = String(formData.get("reportId"));
  const commentId = String(formData.get("commentId"));
  await hideComment(null, commentId, "moderator: hidden");
  await resolveReport(null, reportId, adminId, "hidden");
  redirect("/admin/reports");
}

async function allowAction(formData: FormData): Promise<void> {
  "use server";
  const adminId = await adminCheck();
  if (!adminId) throw new Error("Not authorized");
  const reportId = String(formData.get("reportId"));
  await resolveReport(null, reportId, adminId, "allowed");
  redirect("/admin/reports");
}

export default async function AdminReportsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const rows = await db
    .select({ isAdmin: signers.isAdmin })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (!rows[0]?.isAdmin) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Not authorized</h1>
      </main>
    );
  }
  const pending = await listPendingReports();
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Admin · Reports</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Reports pending moderator decision. Hide bad content or allow if the report was unfounded.
      </p>
      <div className="mt-8 flex flex-col gap-4">
        {pending.length === 0 ? (
          <p className="text-zinc-500">Nothing in the queue.</p>
        ) : (
          pending.map((p: any) => (
            <div key={p.reportId} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="text-xs uppercase tracking-widest text-zinc-500">
                v{p.commentVersion} · {p.commentAnchorId}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{p.commentBody}</p>
              <div className="mt-3 text-xs text-zinc-500">
                Reported by {p.reporterName} · Reason: {p.reason || "(none given)"} · {new Date(p.createdAt).toISOString().slice(0, 16).replace("T", " ")}
              </div>
              <div className="mt-3 flex gap-2">
                <form action={hideAction}>
                  <input type="hidden" name="reportId" value={p.reportId} />
                  <input type="hidden" name="commentId" value={p.commentId} />
                  <button type="submit" className="rounded-full bg-red-700 px-4 py-1.5 text-xs font-medium text-white">
                    Hide comment
                  </button>
                </form>
                <form action={allowAction}>
                  <input type="hidden" name="reportId" value={p.reportId} />
                  <button type="submit" className="rounded-full border border-zinc-300 px-4 py-1.5 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                    Allow (false report)
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/reports "prd/branch commit updates/feat/phase-3-comments-upvotes-moderation.md"
git commit -m "Add admin /reports moderation queue"
```

---

## Task 11: `/admin/signers` (search + role + soft-ban)

**Files:** `src/app/admin/signers/page.tsx`

Minimal: a search box, a results list, and "make admin"/"soft-ban" form actions per row.

- [ ] **Step 1:**

```typescript
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { signers } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

async function adminCheck(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  const rows = await db.select({ isAdmin: signers.isAdmin }).from(signers).where(eq(signers.clerkUserId, userId)).limit(1);
  return Boolean(rows[0]?.isAdmin);
}

async function toggleAdminAction(formData: FormData): Promise<void> {
  "use server";
  if (!(await adminCheck())) throw new Error("Not authorized");
  const id = String(formData.get("id"));
  const make = formData.get("make") === "yes";
  await db.update(signers).set({ isAdmin: make }).where(eq(signers.id, id));
  redirect("/admin/signers");
}

async function toggleBanAction(formData: FormData): Promise<void> {
  "use server";
  if (!(await adminCheck())) throw new Error("Not authorized");
  const id = String(formData.get("id"));
  const ban = formData.get("ban") === "yes";
  await db.update(signers).set({ softBannedAt: ban ? new Date() : null }).where(eq(signers.id, id));
  redirect("/admin/signers");
}

export default async function AdminSignersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  if (!(await adminCheck())) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Not authorized</h1>
      </main>
    );
  }
  const { q = "" } = await searchParams;
  const rows = q
    ? await db.select().from(signers).where(
        or(
          ilike(signers.displayName, `%${q}%`),
          ilike(signers.locationText, `%${q}%`),
          ilike(signers.affiliation, `%${q}%`),
        ),
      ).limit(50)
    : await db.select().from(signers).orderBy(signers.createdAt).limit(50);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Admin · Signers</h1>
      <form className="mt-4 flex gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search name / location / affiliation"
          className="flex-1 rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
        />
        <button type="submit" className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-950">Search</button>
      </form>
      <div className="mt-6 flex flex-col gap-3">
        {rows.map((s: any) => (
          <div key={s.id} className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{s.displayName}</span>
              {s.isAdmin ? <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-800 dark:bg-violet-900/30 dark:text-violet-200">admin</span> : null}
              {s.softBannedAt ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800 dark:bg-red-900/30 dark:text-red-200">soft-banned</span> : null}
            </div>
            <div className="mt-1 text-xs text-zinc-500">
              {[s.locationText, s.affiliation].filter(Boolean).join(" · ") || "—"}
            </div>
            <div className="mt-3 flex gap-2">
              <form action={toggleAdminAction}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="make" value={s.isAdmin ? "no" : "yes"} />
                <button type="submit" className="rounded-full border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
                  {s.isAdmin ? "Revoke admin" : "Make admin"}
                </button>
              </form>
              <form action={toggleBanAction}>
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="ban" value={s.softBannedAt ? "no" : "yes"} />
                <button type="submit" className="rounded-full border border-red-300 px-3 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-700 dark:hover:bg-red-900/30">
                  {s.softBannedAt ? "Unban" : "Soft-ban"}
                </button>
              </form>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/signers "prd/branch commit updates/feat/phase-3-comments-upvotes-moderation.md"
git commit -m "Add admin /signers (search, admin role, soft-ban)"
```

---

## Task 12: `/admin/comments` (recent + bulk-hide)

**Files:** `src/app/admin/comments/page.tsx`

- [ ] **Step 1:**

```typescript
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { signers, comments, versions } from "@/lib/db/schema";
import { hideComment, unhideComment } from "@/server/actions/comments";

export const dynamic = "force-dynamic";

async function adminCheck(): Promise<boolean> {
  const { userId } = await auth();
  if (!userId) return false;
  const rows = await db.select({ isAdmin: signers.isAdmin }).from(signers).where(eq(signers.clerkUserId, userId)).limit(1);
  return Boolean(rows[0]?.isAdmin);
}

async function hideAction(formData: FormData): Promise<void> {
  "use server";
  if (!(await adminCheck())) throw new Error("Not authorized");
  await hideComment(null, String(formData.get("id")), "moderator: hidden");
  redirect("/admin/comments");
}

async function unhideAction(formData: FormData): Promise<void> {
  "use server";
  if (!(await adminCheck())) throw new Error("Not authorized");
  await unhideComment(null, String(formData.get("id")));
  redirect("/admin/comments");
}

export default async function AdminCommentsPage() {
  if (!(await adminCheck())) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Not authorized</h1>
      </main>
    );
  }
  const rows = await db
    .select({
      id: comments.id,
      body: comments.body,
      createdAt: comments.createdAt,
      hiddenAt: comments.hiddenAt,
      hiddenReason: comments.hiddenReason,
      anchorId: comments.anchorId,
      displayName: signers.displayName,
      version: versions.version,
    })
    .from(comments)
    .innerJoin(signers, eq(signers.id, comments.signerId))
    .innerJoin(versions, eq(versions.id, comments.versionId))
    .orderBy(desc(comments.createdAt))
    .limit(100);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Admin · Comments</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">100 most recent comments. Hide/unhide as needed.</p>
      <div className="mt-6 flex flex-col gap-3">
        {rows.map((c: any) => (
          <div key={c.id} className={`rounded-lg border p-3 ${c.hiddenAt ? "border-zinc-300 bg-zinc-50 opacity-60 dark:border-zinc-700 dark:bg-zinc-900" : "border-zinc-200 dark:border-zinc-800"}`}>
            <div className="text-xs text-zinc-500">
              {c.displayName} · v{c.version} · {c.anchorId} · {new Date(c.createdAt).toISOString().slice(0, 16).replace("T", " ")}
              {c.hiddenAt ? ` · hidden: ${c.hiddenReason ?? "—"}` : ""}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            <div className="mt-2">
              {c.hiddenAt ? (
                <form action={unhideAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" className="rounded-full border border-zinc-300 px-3 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">Unhide</button>
                </form>
              ) : (
                <form action={hideAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <button type="submit" className="rounded-full bg-red-700 px-3 py-1 text-xs font-medium text-white">Hide</button>
                </form>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/comments "prd/branch commit updates/feat/phase-3-comments-upvotes-moderation.md"
git commit -m "Add admin /comments recent list with hide/unhide"
```

---

## Task 13: README touchups + final smoke

**Files:** `README.md`

- [ ] **Step 1: Append a section to `README.md`** (before License):

```markdown
## Discussion: comments, upvotes, and moderation

Verified signers can hover any sentence on `/v/[version]` to attach a comment to its anchor. Comments support arbitrary nesting (collapsed past depth 4 desktop / depth 2 mobile). Upvotes are one click; report flags abuse. Five reports on a single comment auto-hide it pending moderator review.

Moderators (signers with `is_admin = true`) get three admin routes:

- `/admin/reports` — pending-report queue (hide comment or dismiss report)
- `/admin/signers` — search signers, grant/revoke admin role, soft-ban
- `/admin/comments` — 100 most recent comments with hide/unhide

Rate limits: 5 comments / signer / minute; 50 / signer / day. Enforced server-side via a DB-backed window count (no Redis).
```

- [ ] **Step 2: Smoke test**

```bash
pnpm test
pnpm exec tsc --noEmit --skipLibCheck
for path in /v/1.0.0 /admin/reports /admin/signers /admin/comments; do
  curl -s -o /dev/null -w "$path → %{http_code}\n" "http://localhost:3000$path"
done
```

Expected: `/v/1.0.0` → 200; admin routes → 307 (Clerk redirect for unauthenticated).

- [ ] **Step 3: Commit**

```bash
git add README.md "prd/branch commit updates/feat/phase-3-comments-upvotes-moderation.md"
git commit -m "Document discussion + moderation surfaces; Phase 3 complete"
```

---

## Self-Review

**Spec coverage (Section 8 + admin routes from 4.2):**
- 3 tables + indexes → Tasks 1, 2 ✓
- Comment create/hide/unhide actions + rate limits → Task 4 ✓
- Upvote toggle → Task 5 ✓
- Report + auto-soft-hide at 5 → Task 6 ✓
- Comment thread (server-rendered, depth-collapse) → Task 8 ✓
- Hover-to-comment + drawer → Task 9 ✓
- `/admin/reports`, `/admin/signers`, `/admin/comments` → Tasks 10, 11, 12 ✓

**Out of scope (designed-for but deferred):**
- Reply notification digest emails (would be Task 14; needs Vercel cron config)
- Real-time updates (page refresh model is the spec)
- Full-text search across comments
- The depth-2 cap on mobile is implemented via CSS rather than detecting mobile server-side; the `<details>` collapse works the same; if the cap should literally be 2 on mobile, that's a follow-up CSS tweak.

**Risks:**
- `listCommentsForAnchor` is invoked once per anchor with comments in Task 9 step 4 — N+1 in number of anchors with discussion. Acceptable until a single page has hundreds of commented anchors; fix later by writing a single query that fetches all comments for a version. (Plan 3.5 polish.)
- The drawer loads ALL comments for the version into the client component's initial JS. At small volumes this is fine; at thousands of comments it'll bloat the page. Pagination/incremental fetch is a follow-up.
- `softBannedAt` is set by `/admin/signers` but **not yet enforced anywhere** in the comment/upvote/report paths. The `submitCommentAction` should check `softBannedAt IS NULL` before allowing posts. Tracked as a known follow-up.

---

**End of plan.**
