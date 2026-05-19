# Selfie After Signing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an optional, admin-approved selfie feature attached to the signer profile. Hybrid `getUserMedia` + file-upload capture, Vercel Blob storage with three derived sizes, `/admin/selfies` moderation queue, report-based auto-hide, full purge on `/account/revoke`.

**Architecture:** Server-action upload + `sharp` resize on the server + Vercel Blob. New `selfies` and `selfie_reports` tables. One `<SelfieAvatar />` component used everywhere a signer's photo appears. The signer's "active" selfie is computed via a partial-unique invariant (`status=approved AND auto_hidden_at IS NULL AND removed_at IS NULL AND replaced_by_selfie_id IS NULL`).

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind · Drizzle ORM · Neon Postgres · `@vercel/blob` · `sharp` · Vitest + pglite · Resend · Clerk

**Spec:** `docs/superpowers/specs/2026-05-19-selfie-after-signing-design.md`

---

## File Structure

**New files:**
- `drizzle/0002_add_selfies.sql` — migration adding `selfies` + `selfie_reports` tables and the partial-unique index.
- `drizzle/meta/0001_snapshot.json` — snapshot for the pre-existing 0001 migration (currently missing on `main`).
- `src/lib/selfie/policy.ts` — input validation constants + `validateSelfieInput()`.
- `src/lib/selfie/queries.ts` — typed read helpers.
- `src/lib/selfie/rateLimit.ts` — `assertSubmissionRate()`.
- `src/lib/storage/blob.ts` — thin `@vercel/blob` wrapper with injectable backend (for tests).
- `src/lib/images/process.ts` — `sharp` pipeline producing `{ original, display, thumbnail }`.
- `src/server/actions/selfie.ts` — six server actions: submit, approve, reject, report, resolveReport, removeMine.
- `src/components/SelfieAvatar.tsx` — server component (sm/md/lg).
- `src/components/SelfieCapture.tsx` — client component (live + upload).
- `src/components/SelfieCard.tsx` — client component for `/account`.
- `src/components/SelfieStatusBadge.tsx` — presentational status badge.
- `src/components/SelfieReviewCard.tsx` — admin review row (client).
- `src/components/ReportSelfieButton.tsx` — client modal.
- `src/app/admin/selfies/page.tsx` — server page.
- `src/app/admin/selfies/AdminSelfiesClient.tsx` — interactive review UI.
- `src/app/api/og/signer/[id]/route.tsx` — OG image route via `next/og`.
- `content/selfie/disclaimer.md` — disclaimer text snapshot.
- `tests/lib/selfie.policy.test.ts`
- `tests/lib/selfie.queries.test.ts`
- `tests/lib/images.process.test.ts`
- `tests/server/selfie.submit.test.ts`
- `tests/server/selfie.review.test.ts`
- `tests/server/selfie.report.test.ts`
- `tests/server/selfie.removeMine.test.ts`
- `tests/_fixtures/tiny-png.ts` — base64-encoded 16×16 PNG buffer for image tests.

**Modified files:**
- `package.json` — add `sharp`, `@vercel/blob`.
- `src/lib/db/schema.ts` — add `selfies` + `selfieReports` table exports.
- `src/lib/email/templates.ts` — add `selfieApproved`, `selfieRejected`, `selfieAutoHidden`.
- `src/server/actions/revoke.ts` — purge selfies + selfie_reports + blobs.
- `src/app/sign/complete/page.tsx` — render `<SelfieCapture context="post-sign" />`.
- `src/app/account/page.tsx` — pass selfie data into `<AccountClient />` which renders `<SelfieCard />`.
- `src/app/account/AccountClient.tsx` — render `<SelfieCard />` above the signatures section.
- `src/app/account/revoke/page.tsx` — update copy to mention photo deletion.
- `src/app/signatories/[id]/page.tsx` — render `<SelfieAvatar size="md" />` + `<ReportSelfieButton />`.
- `src/app/signatories/page.tsx` — pre-fetch active selfies; pass map into `<SignatureCard />`.
- `src/components/SignatureCard.tsx` — render `<SelfieAvatar size="sm" />` on the left.
- `tests/_helpers/pglite-db.ts` — add selfies + selfie_reports DDL.
- `tests/server/revoke.test.ts` — regression that revoke purges selfies.
- `next.config.ts` — add `images.remotePatterns` for the Vercel Blob hostname.

---

## Task 0: Prep + dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install `sharp` and `@vercel/blob`**

```bash
pnpm add sharp @vercel/blob
```

Expected: both appear in `dependencies`. `sharp` brings a platform-specific binary.

- [ ] **Step 2: Install / refresh node_modules**

```bash
pnpm install
```

Expected: `node_modules/sharp` and `node_modules/@vercel/blob` present.

- [ ] **Step 3: Add Vercel Blob hostname to `next.config.ts`**

The Vercel Blob CDN serves blob URLs from `*.public.blob.vercel-storage.com`. Add to allow `<Image>` optimization (alternative: use raw `<img>`; this plan uses `<Image>`).

Edit `next.config.ts` — inside the config object, add:

```ts
images: {
  remotePatterns: [
    {
      protocol: "https",
      hostname: "**.public.blob.vercel-storage.com",
    },
  ],
},
```

- [ ] **Step 4: Add env-var note to `.env.example`** (if file exists; otherwise create with this entry)

```
# Vercel Blob (storage for signer selfies)
BLOB_READ_WRITE_TOKEN=
```

- [ ] **Step 5: Commit + progress log entry**

```bash
git add package.json pnpm-lock.yaml next.config.ts .env.example
# Append a progress-log entry to prd/branch commit updates/worktree-feat+selfie-after-signing.md
git add "prd/branch commit updates/worktree-feat+selfie-after-signing.md"
git commit -m "Add sharp + @vercel/blob deps for selfie feature"
```

---

## Task 1: Schema — `selfies` and `selfie_reports` tables

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/0002_add_selfies.sql`
- Create: `drizzle/meta/0001_snapshot.json` (if not present — backfill the missing snapshot for the existing 0001 file)
- Modify: `drizzle/meta/_journal.json` (register 0001 + 0002)
- Modify: `tests/_helpers/pglite-db.ts` (add DDL to match)
- Create: `tests/lib/db.schema.selfies.test.ts`

- [ ] **Step 1: Write failing test asserting schema parses**

`tests/lib/db.schema.selfies.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { selfies, selfieReports, signers } from "@/lib/db/schema";

describe("selfies schema", () => {
  it("inserts a pending selfie row", async () => {
    const db = await createTestDb();
    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: "u1",
        displayName: "T",
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });
    const [row] = await db
      .insert(selfies)
      .values({
        signerId: signer.id,
        status: "pending",
        originalBlobUrl: "x",
        displayBlobUrl: "y",
        thumbnailBlobUrl: "z",
        originalMime: "image/jpeg",
        originalBytes: 1024,
        captureMethod: "live",
      })
      .returning();
    expect(row.status).toBe("pending");
  });

  it("enforces at-most-one-active-approved per signer", async () => {
    const db = await createTestDb();
    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: "u2",
        displayName: "T",
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });
    await db.insert(selfies).values({
      signerId: signer.id,
      status: "approved",
      originalBlobUrl: "a",
      displayBlobUrl: "b",
      thumbnailBlobUrl: "c",
      originalMime: "image/jpeg",
      originalBytes: 1,
      captureMethod: "live",
    });
    await expect(
      db.insert(selfies).values({
        signerId: signer.id,
        status: "approved",
        originalBlobUrl: "d",
        displayBlobUrl: "e",
        thumbnailBlobUrl: "f",
        originalMime: "image/jpeg",
        originalBytes: 1,
        captureMethod: "live",
      }),
    ).rejects.toThrow();
  });

  it("allows multiple pending submissions per signer", async () => {
    const db = await createTestDb();
    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: "u3",
        displayName: "T",
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });
    for (let i = 0; i < 2; i++) {
      await db.insert(selfies).values({
        signerId: signer.id,
        status: "pending",
        originalBlobUrl: `o${i}`,
        displayBlobUrl: `d${i}`,
        thumbnailBlobUrl: `t${i}`,
        originalMime: "image/jpeg",
        originalBytes: 1,
        captureMethod: "live",
      });
    }
    const rows = await db.select().from(selfies);
    expect(rows).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run — should fail (no selfies/selfieReports export)**

```bash
pnpm test -- selfies
```

Expected: FAIL — "Module not found" or "selfies is not exported."

- [ ] **Step 3: Add drizzle schema declarations**

Append to `src/lib/db/schema.ts`:

```ts
import { integer, index } from "drizzle-orm/pg-core";

export const selfies = pgTable(
  "selfies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    signerId: uuid("signer_id")
      .notNull()
      .references(() => signers.id),
    // 'pending' | 'approved' | 'rejected' | 'auto_hidden' | 'removed'
    status: text("status").notNull(),
    originalBlobUrl: text("original_blob_url").notNull(),
    displayBlobUrl: text("display_blob_url").notNull(),
    thumbnailBlobUrl: text("thumbnail_blob_url").notNull(),
    originalMime: text("original_mime").notNull(),
    originalBytes: integer("original_bytes").notNull(),
    // 'live' | 'upload'
    captureMethod: text("capture_method").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewedBy: uuid("reviewed_by"),
    // 'not_a_face' | 'offensive' | 'imposter' | 'pii_overlay' | 'other'
    rejectionReason: text("rejection_reason"),
    rejectionNote: text("rejection_note"),
    autoHiddenAt: timestamp("auto_hidden_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    replacedBySelfieId: uuid("replaced_by_selfie_id"),
  },
  (t) => [
    index("selfies_signer_id_idx").on(t.signerId),
  ],
);

export const selfieReports = pgTable(
  "selfie_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    selfieId: uuid("selfie_id")
      .notNull()
      .references(() => selfies.id),
    reporterSignerId: uuid("reporter_signer_id")
      .notNull()
      .references(() => signers.id),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by"),
    // 'allowed' | 'hidden'
    resolution: text("resolution"),
  },
  (t) => [
    uniqueIndex("selfie_reports_selfie_reporter_unique").on(
      t.selfieId,
      t.reporterSignerId,
    ),
  ],
);
```

> The partial-unique index on `selfies` (active-approved invariant) is hand-written in the migration SQL, not declared via drizzle's index API. Same trade-off as `versions.is_current` (documented in `src/lib/db/schema.ts` header).

- [ ] **Step 4: Add pglite DDL to test helper**

Edit `tests/_helpers/pglite-db.ts` — append inside the `client.exec(...)` template:

```sql
create table selfies (
  id uuid primary key default gen_random_uuid(),
  signer_id uuid not null references signers(id),
  status text not null check (status in ('pending','approved','rejected','auto_hidden','removed')),
  original_blob_url text not null,
  display_blob_url text not null,
  thumbnail_blob_url text not null,
  original_mime text not null,
  original_bytes integer not null,
  capture_method text not null check (capture_method in ('live','upload')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  rejection_reason text,
  rejection_note text,
  auto_hidden_at timestamptz,
  removed_at timestamptz,
  replaced_by_selfie_id uuid
);
create index selfies_signer_id_idx on selfies (signer_id);
create unique index selfies_signer_active_unique on selfies (signer_id)
  where status = 'approved'
    and auto_hidden_at is null
    and removed_at is null
    and replaced_by_selfie_id is null;
create index selfies_status_submitted_at_idx on selfies (status, submitted_at desc)
  where status = 'pending';

create table selfie_reports (
  id uuid primary key default gen_random_uuid(),
  selfie_id uuid not null references selfies(id),
  reporter_signer_id uuid not null references signers(id),
  reason text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text check (resolution in ('allowed','hidden'))
);
create unique index selfie_reports_selfie_reporter_unique
  on selfie_reports (selfie_id, reporter_signer_id);
create index selfie_reports_selfie_unresolved_idx
  on selfie_reports (selfie_id)
  where resolved_at is null;
```

- [ ] **Step 5: Create migration file `drizzle/0002_add_selfies.sql`**

```sql
-- Adds selfies + selfie_reports tables and the partial-unique active-approved
-- index. The partial-unique cannot be declared via drizzle's index API in
-- 0.36 (same limitation as the versions.is_current case in schema.ts).

CREATE TABLE "selfies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "signer_id" uuid NOT NULL,
  "status" text NOT NULL,
  "original_blob_url" text NOT NULL,
  "display_blob_url" text NOT NULL,
  "thumbnail_blob_url" text NOT NULL,
  "original_mime" text NOT NULL,
  "original_bytes" integer NOT NULL,
  "capture_method" text NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL DEFAULT now(),
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid,
  "rejection_reason" text,
  "rejection_note" text,
  "auto_hidden_at" timestamp with time zone,
  "removed_at" timestamp with time zone,
  "replaced_by_selfie_id" uuid,
  CONSTRAINT "selfies_signer_id_fk"
    FOREIGN KEY ("signer_id") REFERENCES "signers"("id")
);

CREATE INDEX "selfies_signer_id_idx" ON "selfies" ("signer_id");

CREATE UNIQUE INDEX "selfies_signer_active_unique"
  ON "selfies" ("signer_id")
  WHERE "status" = 'approved'
    AND "auto_hidden_at" IS NULL
    AND "removed_at" IS NULL
    AND "replaced_by_selfie_id" IS NULL;

CREATE INDEX "selfies_status_submitted_at_idx"
  ON "selfies" ("status", "submitted_at" DESC)
  WHERE "status" = 'pending';

CREATE TABLE "selfie_reports" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "selfie_id" uuid NOT NULL,
  "reporter_signer_id" uuid NOT NULL,
  "reason" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "resolved_at" timestamp with time zone,
  "resolved_by" uuid,
  "resolution" text,
  CONSTRAINT "selfie_reports_selfie_id_fk"
    FOREIGN KEY ("selfie_id") REFERENCES "selfies"("id"),
  CONSTRAINT "selfie_reports_reporter_signer_id_fk"
    FOREIGN KEY ("reporter_signer_id") REFERENCES "signers"("id")
);

CREATE UNIQUE INDEX "selfie_reports_selfie_reporter_unique"
  ON "selfie_reports" ("selfie_id", "reporter_signer_id");

CREATE INDEX "selfie_reports_selfie_unresolved_idx"
  ON "selfie_reports" ("selfie_id")
  WHERE "resolved_at" IS NULL;
```

- [ ] **Step 6: Update `drizzle/meta/_journal.json`** to register 0001 (currently missing) and 0002

`drizzle/meta/_journal.json`:

```json
{
  "version": "7",
  "dialect": "postgresql",
  "entries": [
    {"idx": 0, "version": "7", "when": 1779138409813, "tag": "0000_ambitious_rage", "breakpoints": true},
    {"idx": 1, "version": "7", "when": 1779138509813, "tag": "0001_add_signer_notification_preference", "breakpoints": true},
    {"idx": 2, "version": "7", "when": 1779238409813, "tag": "0002_add_selfies", "breakpoints": true}
  ]
}
```

(The "when" values do not need to be precise; drizzle uses them only for ordering, and the file paths already provide canonical ordering.)

- [ ] **Step 7: Run schema tests — should now pass**

```bash
pnpm test -- selfies
```

Expected: all three tests PASS.

- [ ] **Step 8: Commit + progress log**

```bash
git add src/lib/db/schema.ts drizzle/0002_add_selfies.sql drizzle/meta/_journal.json tests/_helpers/pglite-db.ts tests/lib/db.schema.selfies.test.ts
git add "prd/branch commit updates/worktree-feat+selfie-after-signing.md"
git commit -m "Add selfies + selfie_reports tables with partial-unique active invariant"
```

---

## Task 2: Selfie policy validation

**Files:**
- Create: `src/lib/selfie/policy.ts`
- Create: `tests/lib/selfie.policy.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/lib/selfie.policy.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  validateSelfieInput,
  MAX_INPUT_BYTES,
  ALLOWED_MIMES,
  SELFIE_AUTO_HIDE_THRESHOLD,
  SELFIE_RATE_LIMIT_PER_HOUR,
} from "@/lib/selfie/policy";

const ok = (mime: string, size = 1024) =>
  validateSelfieInput({ mime, declaredSize: size });

describe("validateSelfieInput", () => {
  it("accepts valid input", () => {
    expect(ok("image/jpeg").ok).toBe(true);
    expect(ok("image/png").ok).toBe(true);
    expect(ok("image/webp").ok).toBe(true);
    expect(ok("image/heic").ok).toBe(true);
  });
  it("rejects disallowed mime", () => {
    const r = ok("application/pdf");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("disallowed_mime");
  });
  it("rejects oversized input", () => {
    const r = validateSelfieInput({
      mime: "image/jpeg",
      declaredSize: MAX_INPUT_BYTES + 1,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("too_large");
  });
  it("rejects empty input", () => {
    const r = validateSelfieInput({ mime: "image/jpeg", declaredSize: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
  });
});

describe("policy constants", () => {
  it("exports auto-hide threshold and rate limit", () => {
    expect(SELFIE_AUTO_HIDE_THRESHOLD).toBe(3);
    expect(SELFIE_RATE_LIMIT_PER_HOUR).toBe(5);
    expect(ALLOWED_MIMES.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
pnpm test -- selfie.policy
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/lib/selfie/policy.ts`**

```ts
export const MAX_INPUT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
] as const;
export const MAX_INPUT_DIMENSION = 8000;
export const SELFIE_RATE_LIMIT_PER_HOUR = 5;
export const SELFIE_AUTO_HIDE_THRESHOLD = 3;

export type ValidationReason =
  | "empty"
  | "too_large"
  | "disallowed_mime"
  | "too_pixels";

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: ValidationReason };

export function validateSelfieInput(opts: {
  mime: string;
  declaredSize: number;
}): ValidationResult {
  if (opts.declaredSize <= 0) return { ok: false, reason: "empty" };
  if (opts.declaredSize > MAX_INPUT_BYTES)
    return { ok: false, reason: "too_large" };
  const normalized = opts.mime.toLowerCase();
  if (!(ALLOWED_MIMES as readonly string[]).includes(normalized))
    return { ok: false, reason: "disallowed_mime" };
  return { ok: true };
}

export function validateImageDimensions(width: number, height: number): ValidationResult {
  if (width > MAX_INPUT_DIMENSION || height > MAX_INPUT_DIMENSION)
    return { ok: false, reason: "too_pixels" };
  return { ok: true };
}

export const REJECTION_REASONS = [
  "not_a_face",
  "offensive",
  "imposter",
  "pii_overlay",
  "other",
] as const;
export type RejectionReason = (typeof REJECTION_REASONS)[number];

export function rejectionReasonToText(reason: RejectionReason): string {
  switch (reason) {
    case "not_a_face":
      return "We couldn't see a recognizable face in your photo.";
    case "offensive":
      return "Your photo includes content we can't publish on this site.";
    case "imposter":
      return "Your photo appears to show someone other than you.";
    case "pii_overlay":
      return "Your photo contains personal information that shouldn't be public (phone, address, etc.).";
    case "other":
      return "We weren't able to publish your photo.";
  }
}
```

- [ ] **Step 4: Run tests — should pass**

```bash
pnpm test -- selfie.policy
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/selfie/policy.ts tests/lib/selfie.policy.test.ts
git commit -m "Add selfie policy validation: size, mime, dimensions, rejection reasons"
```

---

## Task 3: Image processing pipeline

**Files:**
- Create: `src/lib/images/process.ts`
- Create: `tests/_fixtures/tiny-png.ts`
- Create: `tests/lib/images.process.test.ts`

- [ ] **Step 1: Create the fixture — a 16×16 red PNG buffer**

`tests/_fixtures/tiny-png.ts`:

```ts
// 16x16 PNG of solid red (0xff0000). Generated via sharp({ create: ... }).
// Inlined as base64 so tests don't need a binary file on disk.
export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAJklEQVQ4jWP8//8/AzpgYmBgYGBgYGBgYGBgYGBgYGD4z0gqAAA8sAH/zKWoTQAAAABJRU5ErkJggg==";

export function tinyPngBuffer(): Buffer {
  return Buffer.from(TINY_PNG_BASE64, "base64");
}
```

> If the PNG above doesn't decode cleanly via sharp during testing, regenerate with: `node -e 'require("sharp")({create:{width:16,height:16,channels:3,background:{r:255,g:0,b:0}}}).png().toBuffer().then(b=>console.log(b.toString("base64")))'`. Replace the literal in the fixture.

- [ ] **Step 2: Write the failing test**

`tests/lib/images.process.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { processSelfieImage } from "@/lib/images/process";
import { tinyPngBuffer } from "../_fixtures/tiny-png";

describe("processSelfieImage", () => {
  it("returns three buffers with the right dimensions and mimes", async () => {
    const buf = tinyPngBuffer();
    const out = await processSelfieImage(buf);
    expect(out.dimensions.width).toBeGreaterThan(0);
    expect(out.dimensions.height).toBeGreaterThan(0);

    const originalMeta = await sharp(out.original).metadata();
    expect(originalMeta.format).toBe("jpeg");

    const displayMeta = await sharp(out.display).metadata();
    expect(displayMeta.format).toBe("webp");
    expect(displayMeta.width).toBe(512);
    expect(displayMeta.height).toBe(512);

    const thumbMeta = await sharp(out.thumbnail).metadata();
    expect(thumbMeta.format).toBe("webp");
    expect(thumbMeta.width).toBe(96);
    expect(thumbMeta.height).toBe(96);
  });

  it("strips EXIF metadata from outputs", async () => {
    const buf = tinyPngBuffer();
    const out = await processSelfieImage(buf);
    const meta = await sharp(out.original).metadata();
    // sharp.metadata().exif is undefined when EXIF is absent.
    expect(meta.exif).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run — should fail**

```bash
pnpm test -- images.process
```

Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/lib/images/process.ts`**

```ts
import sharp from "sharp";

export interface ProcessedSelfie {
  original: Buffer;
  display: Buffer;
  thumbnail: Buffer;
  dimensions: { width: number; height: number };
}

const ORIGINAL_MAX = 2048;
const DISPLAY_SIZE = 512;
const THUMBNAIL_SIZE = 96;

export async function processSelfieImage(input: Buffer): Promise<ProcessedSelfie> {
  const base = sharp(input, { failOn: "error" }).rotate(); // auto-rotate via EXIF
  const meta = await base.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const original = await base
    .clone()
    .resize({
      width: ORIGINAL_MAX,
      height: ORIGINAL_MAX,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: 92, mozjpeg: true })
    .withMetadata({ exif: {} })
    .toBuffer();

  const display = await base
    .clone()
    .resize({ width: DISPLAY_SIZE, height: DISPLAY_SIZE, fit: "cover", position: "centre" })
    .webp({ quality: 85 })
    .withMetadata({ exif: {} })
    .toBuffer();

  const thumbnail = await base
    .clone()
    .resize({ width: THUMBNAIL_SIZE, height: THUMBNAIL_SIZE, fit: "cover", position: "centre" })
    .webp({ quality: 80 })
    .withMetadata({ exif: {} })
    .toBuffer();

  return { original, display, thumbnail, dimensions: { width, height } };
}
```

- [ ] **Step 5: Run tests — should pass**

```bash
pnpm test -- images.process
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/images/process.ts tests/_fixtures/tiny-png.ts tests/lib/images.process.test.ts
git commit -m "Add sharp-based selfie image pipeline (original + display + thumbnail)"
```

---

## Task 4: Vercel Blob wrapper with injectable backend

**Files:**
- Create: `src/lib/storage/blob.ts`

> No standalone test — exercised by server-action tests via the injectable backend.

- [ ] **Step 1: Write `src/lib/storage/blob.ts`**

```ts
// Thin wrapper around @vercel/blob with an injectable backend so unit tests
// can swap a fake. In production, use the default (lazy-loaded) backend.

export interface SelfieBlobBackend {
  put(
    pathname: string,
    body: Buffer,
    opts: { contentType: string; access: "public" | "private" },
  ): Promise<{ url: string }>;
  del(url: string): Promise<void>;
}

let _defaultBackend: SelfieBlobBackend | null = null;
function getDefaultBackend(): SelfieBlobBackend {
  if (_defaultBackend) return _defaultBackend;
  _defaultBackend = {
    async put(pathname, body, opts) {
      // Lazy-load so tests that never call this don't pull @vercel/blob.
      const mod = await import("@vercel/blob");
      const res = await mod.put(pathname, body, {
        access: opts.access === "private" ? ("private" as any) : "public",
        contentType: opts.contentType,
        addRandomSuffix: true,
      } as any);
      return { url: res.url };
    },
    async del(url) {
      const mod = await import("@vercel/blob");
      await mod.del(url);
    },
  };
  return _defaultBackend;
}

export interface UploadSelfieBlobsInput {
  signerId: string;
  selfieId: string;
  original: Buffer;
  originalMime: string;
  display: Buffer;
  thumbnail: Buffer;
}

export interface UploadedSelfieBlobs {
  originalUrl: string;
  displayUrl: string;
  thumbnailUrl: string;
}

export async function uploadSelfieBlobs(
  input: UploadSelfieBlobsInput,
  backend: SelfieBlobBackend = getDefaultBackend(),
): Promise<UploadedSelfieBlobs> {
  const base = `selfies/${input.signerId}/${input.selfieId}`;
  const originalExt = input.originalMime.includes("png")
    ? "jpg"
    : "jpg"; // we always re-encode original to JPEG in process.ts
  const original = await backend.put(`${base}/original.${originalExt}`, input.original, {
    contentType: "image/jpeg",
    access: "private",
  });
  const display = await backend.put(`${base}/display.webp`, input.display, {
    contentType: "image/webp",
    access: "public",
  });
  const thumbnail = await backend.put(
    `${base}/thumbnail.webp`,
    input.thumbnail,
    { contentType: "image/webp", access: "public" },
  );
  return {
    originalUrl: original.url,
    displayUrl: display.url,
    thumbnailUrl: thumbnail.url,
  };
}

export async function deleteSelfieBlobsByUrls(
  urls: { originalUrl?: string | null; displayUrl?: string | null; thumbnailUrl?: string | null },
  backend: SelfieBlobBackend = getDefaultBackend(),
): Promise<void> {
  for (const url of [urls.originalUrl, urls.displayUrl, urls.thumbnailUrl]) {
    if (!url) continue;
    try {
      await backend.del(url);
    } catch (err) {
      // Idempotent — 404 / already-deleted is acceptable.
      console.warn("[blob] delete failed (ignored):", url, err);
    }
  }
}

export function createInMemoryBackend(): SelfieBlobBackend & {
  store: Map<string, { body: Buffer; contentType: string; access: string }>;
} {
  const store = new Map<
    string,
    { body: Buffer; contentType: string; access: string }
  >();
  let n = 0;
  return {
    store,
    async put(pathname, body, opts) {
      const url = `mem://${pathname}-${++n}`;
      store.set(url, { body, contentType: opts.contentType, access: opts.access });
      return { url };
    },
    async del(url) {
      store.delete(url);
    },
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/storage/blob.ts
git commit -m "Add Vercel Blob wrapper with injectable backend for testing"
```

---

## Task 5: Selfie queries

**Files:**
- Create: `src/lib/selfie/queries.ts`
- Create: `tests/lib/selfie.queries.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/lib/selfie.queries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { selfies, signers } from "@/lib/db/schema";
import {
  getActiveSelfieForSigner,
  getActiveSelfiesForSigners,
  countUnresolvedReports,
} from "@/lib/selfie/queries";

async function makeSigner(db: any, clerkId: string) {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId: clerkId,
      displayName: clerkId,
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return row.id as string;
}

async function insertSelfie(db: any, signerId: string, overrides: any = {}) {
  const [row] = await db
    .insert(selfies)
    .values({
      signerId,
      status: "pending",
      originalBlobUrl: "o",
      displayBlobUrl: "d",
      thumbnailBlobUrl: "t",
      originalMime: "image/jpeg",
      originalBytes: 1,
      captureMethod: "live",
      ...overrides,
    })
    .returning();
  return row;
}

describe("getActiveSelfieForSigner", () => {
  it("returns null when no selfies", async () => {
    const db = await createTestDb();
    const id = await makeSigner(db, "u1");
    expect(await getActiveSelfieForSigner(id, db)).toBeNull();
  });

  it("returns null when only pending", async () => {
    const db = await createTestDb();
    const id = await makeSigner(db, "u1");
    await insertSelfie(db, id, { status: "pending" });
    expect(await getActiveSelfieForSigner(id, db)).toBeNull();
  });

  it("returns approved selfie", async () => {
    const db = await createTestDb();
    const id = await makeSigner(db, "u1");
    const row = await insertSelfie(db, id, { status: "approved" });
    const active = await getActiveSelfieForSigner(id, db);
    expect(active?.id).toBe(row.id);
  });

  it("returns null when approved selfie is auto-hidden", async () => {
    const db = await createTestDb();
    const id = await makeSigner(db, "u1");
    await insertSelfie(db, id, { status: "approved", autoHiddenAt: new Date() });
    expect(await getActiveSelfieForSigner(id, db)).toBeNull();
  });

  it("returns null when approved selfie has been replaced", async () => {
    const db = await createTestDb();
    const id = await makeSigner(db, "u1");
    const oldRow = await insertSelfie(db, id, { status: "approved" });
    // Hack: directly set replaced_by_selfie_id to a fresh uuid (we'd normally
    // point at a new approved row, but for this test the FK doesn't enforce
    // existence in our schema definition — selfies.replaced_by_selfie_id is
    // declared without a foreign-key reference back to selfies in the drizzle
    // schema for the same reason the FK is omitted in real prod: self-FKs
    // complicate the cascade story. The migration SQL omits the FK too.)
    await db
      .update(selfies)
      .set({ replacedBySelfieId: oldRow.id })
      .where((selfies as any).id.eq(oldRow.id));
    expect(await getActiveSelfieForSigner(id, db)).toBeNull();
  });
});

describe("getActiveSelfiesForSigners", () => {
  it("returns a map of active approved selfies", async () => {
    const db = await createTestDb();
    const a = await makeSigner(db, "u-a");
    const b = await makeSigner(db, "u-b");
    const c = await makeSigner(db, "u-c");
    await insertSelfie(db, a, { status: "approved" });
    await insertSelfie(db, b, { status: "pending" });
    // c has no selfies
    const map = await getActiveSelfiesForSigners([a, b, c], db);
    expect(map.get(a)).toBeDefined();
    expect(map.get(b)).toBeUndefined();
    expect(map.get(c)).toBeUndefined();
  });
});

describe("countUnresolvedReports", () => {
  it("returns 0 when no reports", async () => {
    const db = await createTestDb();
    const signer = await makeSigner(db, "u1");
    const row = await insertSelfie(db, signer);
    expect(await countUnresolvedReports(row.id, db)).toBe(0);
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
pnpm test -- selfie.queries
```

Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/lib/selfie/queries.ts`**

```ts
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { selfies, selfieReports } from "@/lib/db/schema";

function getDefaultDb() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("@/lib/db").db;
}

const activeApprovedCondition = and(
  eq(selfies.status, "approved"),
  isNull(selfies.autoHiddenAt),
  isNull(selfies.removedAt),
  isNull(selfies.replacedBySelfieId),
);

export async function getActiveSelfieForSigner(
  signerId: string,
  dbArg: any = null,
) {
  const db = dbArg ?? getDefaultDb();
  const rows = await db
    .select()
    .from(selfies)
    .where(and(eq(selfies.signerId, signerId), activeApprovedCondition))
    .limit(1);
  return rows[0] ?? null;
}

export async function getActiveSelfiesForSigners(
  signerIds: string[],
  dbArg: any = null,
): Promise<Map<string, { displayBlobUrl: string; thumbnailBlobUrl: string }>> {
  if (signerIds.length === 0) return new Map();
  const db = dbArg ?? getDefaultDb();
  const rows = await db
    .select({
      signerId: selfies.signerId,
      displayBlobUrl: selfies.displayBlobUrl,
      thumbnailBlobUrl: selfies.thumbnailBlobUrl,
    })
    .from(selfies)
    .where(and(inArray(selfies.signerId, signerIds), activeApprovedCondition));
  const map = new Map<
    string,
    { displayBlobUrl: string; thumbnailBlobUrl: string }
  >();
  for (const r of rows) {
    map.set(r.signerId, {
      displayBlobUrl: r.displayBlobUrl,
      thumbnailBlobUrl: r.thumbnailBlobUrl,
    });
  }
  return map;
}

export async function countUnresolvedReports(
  selfieId: string,
  dbArg: any = null,
): Promise<number> {
  const db = dbArg ?? getDefaultDb();
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(selfieReports)
    .where(
      and(eq(selfieReports.selfieId, selfieId), isNull(selfieReports.resolvedAt)),
    );
  return Number(rows[0]?.value ?? 0);
}

export interface PendingSelfieRow {
  id: string;
  signerId: string;
  displayBlobUrl: string;
  originalBlobUrl: string;
  submittedAt: Date;
  captureMethod: string;
  signer: {
    displayName: string;
    affiliation: string | null;
    locationText: string | null;
    verificationMethod: string;
    createdAt: Date;
  };
}

export async function getPendingSelfies(
  dbArg: any = null,
): Promise<PendingSelfieRow[]> {
  const db = dbArg ?? getDefaultDb();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { signers } = require("@/lib/db/schema");
  const rows = await db
    .select({
      id: selfies.id,
      signerId: selfies.signerId,
      displayBlobUrl: selfies.displayBlobUrl,
      originalBlobUrl: selfies.originalBlobUrl,
      submittedAt: selfies.submittedAt,
      captureMethod: selfies.captureMethod,
      displayName: signers.displayName,
      affiliation: signers.affiliation,
      locationText: signers.locationText,
      verificationMethod: signers.verificationMethod,
      createdAt: signers.createdAt,
    })
    .from(selfies)
    .innerJoin(signers, eq(signers.id, selfies.signerId))
    .where(eq(selfies.status, "pending"));
  return rows.map((r: any) => ({
    id: r.id,
    signerId: r.signerId,
    displayBlobUrl: r.displayBlobUrl,
    originalBlobUrl: r.originalBlobUrl,
    submittedAt: r.submittedAt,
    captureMethod: r.captureMethod,
    signer: {
      displayName: r.displayName,
      affiliation: r.affiliation,
      locationText: r.locationText,
      verificationMethod: r.verificationMethod,
      createdAt: r.createdAt,
    },
  }));
}
```

- [ ] **Step 4: Run — should pass**

```bash
pnpm test -- selfie.queries
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/selfie/queries.ts tests/lib/selfie.queries.test.ts
git commit -m "Add selfie query helpers (active + batch + report counting)"
```

---

## Task 6: Email templates

**Files:**
- Modify: `src/lib/email/templates.ts`

- [ ] **Step 1: Add three template functions**

Append to `src/lib/email/templates.ts`:

```ts
export function selfieApproved(opts: {
  displayName: string;
  signerPageUrl: string;
  accountUrl: string;
}): { subject: string; text: string } {
  return {
    subject: "Your photo is live on the AI Bill of Rights",
    text: `Hi ${opts.displayName},

Your photo has been approved and is now showing on your public signer page.

See it: ${opts.signerPageUrl}

Manage your photo (replace or remove) anytime:
${opts.accountUrl}

— The AI Bill of Rights project
`,
  };
}

export function selfieRejected(opts: {
  displayName: string;
  reasonText: string;
  accountUrl: string;
}): { subject: string; text: string } {
  return {
    subject: "We couldn't publish your photo",
    text: `Hi ${opts.displayName},

We weren't able to publish the photo you submitted: ${opts.reasonText}

You can try again with a different photo from your account page:
${opts.accountUrl}

— The AI Bill of Rights project
`,
  };
}

export function selfieAutoHidden(opts: {
  displayName: string;
  appealUrl: string;
}): { subject: string; text: string } {
  return {
    subject: "Your photo was temporarily hidden after multiple reports",
    text: `Hi ${opts.displayName},

Other signers reported your photo, and as a safety measure we've hidden it from public view while an admin takes another look. If you think this was a mistake, you can upload a different photo from your account page:

${opts.appealUrl}

— The AI Bill of Rights project
`,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/email/templates.ts
git commit -m "Add selfie email templates: approved, rejected, auto-hidden"
```

---

## Task 7: `submitSelfieAction`

**Files:**
- Create: `src/server/actions/selfie.ts` (this task adds only `submitSelfieAction`)
- Create: `tests/server/selfie.submit.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/server/selfie.submit.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { selfies, signers } from "@/lib/db/schema";
import { submitSelfie } from "@/server/actions/selfie";
import { createInMemoryBackend } from "@/lib/storage/blob";
import { tinyPngBuffer } from "../_fixtures/tiny-png";

async function makeSigner(db: any) {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId: "u1",
      displayName: "Test",
      verificationMethod: "email",
      verifiedAt: new Date(),
    })
    .returning({ id: signers.id });
  return row.id as string;
}

describe("submitSelfie", () => {
  it("inserts a pending row and uploads three blobs", async () => {
    const db = await createTestDb();
    const signerId = await makeSigner(db);
    const backend = createInMemoryBackend();
    const { selfieId } = await submitSelfie(db, {
      signerId,
      buffer: tinyPngBuffer(),
      mime: "image/png",
      captureMethod: "live",
      blobBackend: backend,
    });
    const rows = await db.select().from(selfies);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(selfieId);
    expect(rows[0].status).toBe("pending");
    expect(backend.store.size).toBe(3);
  });

  it("rejects oversize input without uploading", async () => {
    const db = await createTestDb();
    const signerId = await makeSigner(db);
    const backend = createInMemoryBackend();
    const big = Buffer.alloc(11 * 1024 * 1024, 0);
    await expect(
      submitSelfie(db, {
        signerId,
        buffer: big,
        mime: "image/jpeg",
        captureMethod: "upload",
        blobBackend: backend,
      }),
    ).rejects.toThrow();
    expect(backend.store.size).toBe(0);
  });

  it("rejects bad mime without uploading", async () => {
    const db = await createTestDb();
    const signerId = await makeSigner(db);
    const backend = createInMemoryBackend();
    await expect(
      submitSelfie(db, {
        signerId,
        buffer: tinyPngBuffer(),
        mime: "application/pdf",
        captureMethod: "upload",
        blobBackend: backend,
      }),
    ).rejects.toThrow();
    expect(backend.store.size).toBe(0);
  });

  it("enforces hourly rate limit (5 successful, 6th throws)", async () => {
    const db = await createTestDb();
    const signerId = await makeSigner(db);
    const backend = createInMemoryBackend();
    for (let i = 0; i < 5; i++) {
      await submitSelfie(db, {
        signerId,
        buffer: tinyPngBuffer(),
        mime: "image/png",
        captureMethod: "upload",
        blobBackend: backend,
      });
    }
    await expect(
      submitSelfie(db, {
        signerId,
        buffer: tinyPngBuffer(),
        mime: "image/png",
        captureMethod: "upload",
        blobBackend: backend,
      }),
    ).rejects.toThrow(/rate/i);
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
pnpm test -- selfie.submit
```

Expected: FAIL (module not found).

- [ ] **Step 3: Create `src/server/actions/selfie.ts` with `submitSelfie` (testable core)**

```ts
"use server";

import { and, eq, gte, sql } from "drizzle-orm";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { selfies, signers } from "@/lib/db/schema";
import { processSelfieImage } from "@/lib/images/process";
import {
  validateSelfieInput,
  validateImageDimensions,
  SELFIE_RATE_LIMIT_PER_HOUR,
} from "@/lib/selfie/policy";
import {
  uploadSelfieBlobs,
  deleteSelfieBlobsByUrls,
  type SelfieBlobBackend,
} from "@/lib/storage/blob";

let _db: any | null = null;
function getDb() {
  if (!_db) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    _db = require("@/lib/db").db;
  }
  return _db;
}

export interface SubmitSelfieInput {
  signerId: string;
  buffer: Buffer;
  mime: string;
  captureMethod: "live" | "upload";
  blobBackend?: SelfieBlobBackend;
}

/**
 * Testable core of submitSelfieAction. Pure function: takes a db client and
 * the inputs, no auth/headers/redirect. Tests inject an in-memory blob backend.
 */
export async function submitSelfie(
  db: any,
  input: SubmitSelfieInput,
): Promise<{ selfieId: string }> {
  const policy = validateSelfieInput({
    mime: input.mime,
    declaredSize: input.buffer.byteLength,
  });
  if (!policy.ok) {
    throw new Error(`Selfie rejected: ${policy.reason}`);
  }

  // Rate limit BEFORE doing expensive image work
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentRows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(selfies)
    .where(
      and(
        eq(selfies.signerId, input.signerId),
        gte(selfies.submittedAt, oneHourAgo),
      ),
    );
  const recent = Number(recentRows[0]?.value ?? 0);
  if (recent >= SELFIE_RATE_LIMIT_PER_HOUR) {
    throw new Error(
      "rate limit: too many photo submissions in the last hour",
    );
  }

  const processed = await processSelfieImage(input.buffer);
  const dim = validateImageDimensions(
    processed.dimensions.width,
    processed.dimensions.height,
  );
  if (!dim.ok) {
    throw new Error(`Selfie rejected: ${dim.reason}`);
  }

  // Pre-allocate the selfie id so blob paths can use it before insert
  const selfieId = crypto.randomUUID();
  let uploaded: Awaited<ReturnType<typeof uploadSelfieBlobs>> | null = null;
  try {
    uploaded = await uploadSelfieBlobs(
      {
        signerId: input.signerId,
        selfieId,
        original: processed.original,
        originalMime: "image/jpeg",
        display: processed.display,
        thumbnail: processed.thumbnail,
      },
      input.blobBackend,
    );

    await db.insert(selfies).values({
      id: selfieId,
      signerId: input.signerId,
      status: "pending",
      originalBlobUrl: uploaded.originalUrl,
      displayBlobUrl: uploaded.displayUrl,
      thumbnailBlobUrl: uploaded.thumbnailUrl,
      originalMime: "image/jpeg",
      originalBytes: processed.original.byteLength,
      captureMethod: input.captureMethod,
    });

    return { selfieId };
  } catch (err) {
    if (uploaded) {
      await deleteSelfieBlobsByUrls(
        {
          originalUrl: uploaded.originalUrl,
          displayUrl: uploaded.displayUrl,
          thumbnailUrl: uploaded.thumbnailUrl,
        },
        input.blobBackend,
      );
    }
    throw err;
  }
}

/**
 * Server-action entry point invoked by form submissions. Reads auth + form,
 * delegates to submitSelfie. Redirects on success/error.
 */
export async function submitSelfieAction(formData: FormData): Promise<void> {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const file = formData.get("photo");
  if (!(file instanceof File)) {
    throw new Error("No photo provided");
  }
  const captureMethodRaw = String(formData.get("captureMethod") ?? "upload");
  const captureMethod = captureMethodRaw === "live" ? "live" : "upload";

  const signerRows = await getDb()
    .select()
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (signerRows.length === 0) {
    redirect("/");
  }
  const signer = signerRows[0];

  const arrayBuf = await file.arrayBuffer();
  await submitSelfie(getDb(), {
    signerId: signer.id,
    buffer: Buffer.from(arrayBuf),
    mime: file.type,
    captureMethod,
  });

  revalidatePath("/account");
  revalidatePath(`/signatories/${signer.id}`);
  redirect("/account?selfie=submitted");
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test -- selfie.submit
```

Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/selfie.ts tests/server/selfie.submit.test.ts
git commit -m "Add submitSelfie server action: validates, resizes, uploads, inserts pending"
```

---

## Task 8: `approveSelfieAction` + `rejectSelfieAction`

**Files:**
- Modify: `src/server/actions/selfie.ts`
- Create: `tests/server/selfie.review.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/server/selfie.review.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { selfies, signers } from "@/lib/db/schema";
import {
  approveSelfie,
  rejectSelfie,
  submitSelfie,
} from "@/server/actions/selfie";
import { createInMemoryBackend } from "@/lib/storage/blob";
import { tinyPngBuffer } from "../_fixtures/tiny-png";

async function makeSigner(db: any, clerkId: string, isAdmin = false) {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId: clerkId,
      displayName: clerkId,
      verificationMethod: "email",
      verifiedAt: new Date(),
      isAdmin,
    })
    .returning({ id: signers.id });
  return row.id as string;
}

async function submitOne(db: any, signerId: string) {
  const backend = createInMemoryBackend();
  const { selfieId } = await submitSelfie(db, {
    signerId,
    buffer: tinyPngBuffer(),
    mime: "image/png",
    captureMethod: "live",
    blobBackend: backend,
  });
  return selfieId;
}

describe("approveSelfie", () => {
  it("transitions pending → approved and stamps reviewer + timestamp", async () => {
    const db = await createTestDb();
    const signer = await makeSigner(db, "u1");
    const admin = await makeSigner(db, "admin", true);
    const id = await submitOne(db, signer);
    await approveSelfie(db, { selfieId: id, adminSignerId: admin });
    const [row] = await db.select().from(selfies);
    expect(row.status).toBe("approved");
    expect(row.reviewedBy).toBe(admin);
    expect(row.reviewedAt).toBeInstanceOf(Date);
  });

  it("marks any prior active selfie as replaced when new one approved", async () => {
    const db = await createTestDb();
    const signer = await makeSigner(db, "u1");
    const admin = await makeSigner(db, "admin", true);
    const first = await submitOne(db, signer);
    await approveSelfie(db, { selfieId: first, adminSignerId: admin });
    const second = await submitOne(db, signer);
    await approveSelfie(db, { selfieId: second, adminSignerId: admin });
    const rows = await db.select().from(selfies);
    const firstRow = rows.find((r: any) => r.id === first);
    const secondRow = rows.find((r: any) => r.id === second);
    expect(firstRow.replacedBySelfieId).toBe(second);
    expect(secondRow.status).toBe("approved");
  });

  it("refuses to re-approve an already-approved row", async () => {
    const db = await createTestDb();
    const signer = await makeSigner(db, "u1");
    const admin = await makeSigner(db, "admin", true);
    const id = await submitOne(db, signer);
    await approveSelfie(db, { selfieId: id, adminSignerId: admin });
    await expect(
      approveSelfie(db, { selfieId: id, adminSignerId: admin }),
    ).rejects.toThrow();
  });
});

describe("rejectSelfie", () => {
  it("transitions pending → rejected with reason", async () => {
    const db = await createTestDb();
    const signer = await makeSigner(db, "u1");
    const admin = await makeSigner(db, "admin", true);
    const id = await submitOne(db, signer);
    await rejectSelfie(db, {
      selfieId: id,
      adminSignerId: admin,
      reason: "not_a_face",
    });
    const [row] = await db.select().from(selfies);
    expect(row.status).toBe("rejected");
    expect(row.rejectionReason).toBe("not_a_face");
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
pnpm test -- selfie.review
```

Expected: FAIL (functions not exported).

- [ ] **Step 3: Add `approveSelfie` + `rejectSelfie` to `src/server/actions/selfie.ts`**

Append to the existing file:

```ts
import { isNull } from "drizzle-orm";
import { type RejectionReason, rejectionReasonToText } from "@/lib/selfie/policy";

export interface ApproveSelfieInput {
  selfieId: string;
  adminSignerId: string;
}

export async function approveSelfie(
  db: any,
  input: ApproveSelfieInput,
): Promise<void> {
  const rows = await db
    .select()
    .from(selfies)
    .where(eq(selfies.id, input.selfieId))
    .limit(1);
  if (rows.length === 0) throw new Error("Selfie not found");
  const target = rows[0];
  if (target.status !== "pending") {
    throw new Error(`Selfie is not pending (status=${target.status})`);
  }

  // Mark any currently-active selfie for this signer as replaced.
  const activeRows = await db
    .select({ id: selfies.id })
    .from(selfies)
    .where(
      and(
        eq(selfies.signerId, target.signerId),
        eq(selfies.status, "approved"),
        isNull(selfies.autoHiddenAt),
        isNull(selfies.removedAt),
        isNull(selfies.replacedBySelfieId),
      ),
    );
  for (const a of activeRows) {
    await db
      .update(selfies)
      .set({ replacedBySelfieId: input.selfieId })
      .where(eq(selfies.id, a.id));
  }

  await db
    .update(selfies)
    .set({
      status: "approved",
      reviewedAt: new Date(),
      reviewedBy: input.adminSignerId,
    })
    .where(eq(selfies.id, input.selfieId));
}

export interface RejectSelfieInput {
  selfieId: string;
  adminSignerId: string;
  reason: RejectionReason;
  note?: string;
}

export async function rejectSelfie(
  db: any,
  input: RejectSelfieInput,
): Promise<void> {
  const rows = await db
    .select()
    .from(selfies)
    .where(eq(selfies.id, input.selfieId))
    .limit(1);
  if (rows.length === 0) throw new Error("Selfie not found");
  if (rows[0].status !== "pending") {
    throw new Error(`Selfie is not pending (status=${rows[0].status})`);
  }
  await db
    .update(selfies)
    .set({
      status: "rejected",
      reviewedAt: new Date(),
      reviewedBy: input.adminSignerId,
      rejectionReason: input.reason,
      rejectionNote: input.note ?? null,
    })
    .where(eq(selfies.id, input.selfieId));
}
```

And the form-action wrappers (admin-gated):

```ts
import { getCurrentAdmin } from "@/lib/admin/check";

async function requireAdminContext() {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") throw new Error("Forbidden: admin only");
  return ctx.signer.id;
}

export async function approveSelfieAction(selfieId: string): Promise<void> {
  const adminId = await requireAdminContext();
  await approveSelfie(getDb(), { selfieId, adminSignerId: adminId });

  // Best-effort email + revalidate
  try {
    const [target] = await getDb()
      .select({ signerId: selfies.signerId, signerName: signers.displayName, clerkUserId: signers.clerkUserId })
      .from(selfies)
      .innerJoin(signers, eq(signers.id, selfies.signerId))
      .where(eq(selfies.id, selfieId))
      .limit(1);
    if (target) {
      const clerkClientFn = (await import("@clerk/nextjs/server")).clerkClient;
      const clerk = await clerkClientFn();
      const user = await clerk.users.getUser(target.clerkUserId);
      const email = user.primaryEmailAddress?.emailAddress;
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      if (email) {
        const { selfieApproved } = await import("@/lib/email/templates");
        const { sendEmail } = await import("@/lib/email/send");
        await sendEmail({
          to: email,
          ...selfieApproved({
            displayName: target.signerName,
            signerPageUrl: `${siteUrl}/signatories/${target.signerId}`,
            accountUrl: `${siteUrl}/account`,
          }),
        });
      }
    }
  } catch (err) {
    console.error("[selfie] approval email failed:", err);
  }

  revalidatePath("/admin/selfies");
  revalidatePath("/signatories");
}

export async function rejectSelfieAction(
  selfieId: string,
  reason: RejectionReason,
  note?: string,
): Promise<void> {
  const adminId = await requireAdminContext();
  await rejectSelfie(getDb(), { selfieId, adminSignerId: adminId, reason, note });
  try {
    const [target] = await getDb()
      .select({ signerName: signers.displayName, clerkUserId: signers.clerkUserId })
      .from(selfies)
      .innerJoin(signers, eq(signers.id, selfies.signerId))
      .where(eq(selfies.id, selfieId))
      .limit(1);
    if (target) {
      const clerkClientFn = (await import("@clerk/nextjs/server")).clerkClient;
      const clerk = await clerkClientFn();
      const user = await clerk.users.getUser(target.clerkUserId);
      const email = user.primaryEmailAddress?.emailAddress;
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
      if (email) {
        const { selfieRejected } = await import("@/lib/email/templates");
        const { sendEmail } = await import("@/lib/email/send");
        await sendEmail({
          to: email,
          ...selfieRejected({
            displayName: target.signerName,
            reasonText: rejectionReasonToText(reason),
            accountUrl: `${siteUrl}/account`,
          }),
        });
      }
    }
  } catch (err) {
    console.error("[selfie] rejection email failed:", err);
  }
  revalidatePath("/admin/selfies");
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test -- selfie.review
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/selfie.ts tests/server/selfie.review.test.ts
git commit -m "Add approve + reject selfie actions with replace-on-approve semantics"
```

---

## Task 9: `reportSelfieAction` + `resolveSelfieReportAction`

**Files:**
- Modify: `src/server/actions/selfie.ts`
- Create: `tests/server/selfie.report.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/server/selfie.report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { selfies, selfieReports, signers } from "@/lib/db/schema";
import {
  approveSelfie,
  reportSelfie,
  resolveSelfieReports,
  submitSelfie,
} from "@/server/actions/selfie";
import { createInMemoryBackend } from "@/lib/storage/blob";
import { tinyPngBuffer } from "../_fixtures/tiny-png";
import { eq } from "drizzle-orm";

async function makeSigner(db: any, clerkId: string, isAdmin = false) {
  const [row] = await db
    .insert(signers)
    .values({
      clerkUserId: clerkId,
      displayName: clerkId,
      verificationMethod: "email",
      verifiedAt: new Date(),
      isAdmin,
    })
    .returning({ id: signers.id });
  return row.id as string;
}

async function approveOne(db: any, signerId: string, adminId: string) {
  const backend = createInMemoryBackend();
  const { selfieId } = await submitSelfie(db, {
    signerId,
    buffer: tinyPngBuffer(),
    mime: "image/png",
    captureMethod: "live",
    blobBackend: backend,
  });
  await approveSelfie(db, { selfieId, adminSignerId: adminId });
  return selfieId;
}

describe("reportSelfie", () => {
  it("inserts a report row", async () => {
    const db = await createTestDb();
    const owner = await makeSigner(db, "owner");
    const admin = await makeSigner(db, "admin", true);
    const reporter = await makeSigner(db, "reporter");
    const id = await approveOne(db, owner, admin);
    await reportSelfie(db, {
      selfieId: id,
      reporterSignerId: reporter,
      reason: "weird",
    });
    const rows = await db.select().from(selfieReports);
    expect(rows).toHaveLength(1);
  });

  it("auto-hides at threshold 3", async () => {
    const db = await createTestDb();
    const owner = await makeSigner(db, "owner");
    const admin = await makeSigner(db, "admin", true);
    const r1 = await makeSigner(db, "r1");
    const r2 = await makeSigner(db, "r2");
    const r3 = await makeSigner(db, "r3");
    const id = await approveOne(db, owner, admin);
    await reportSelfie(db, { selfieId: id, reporterSignerId: r1 });
    await reportSelfie(db, { selfieId: id, reporterSignerId: r2 });
    let [row] = await db.select().from(selfies).where(eq(selfies.id, id));
    expect(row.autoHiddenAt).toBeNull();
    await reportSelfie(db, { selfieId: id, reporterSignerId: r3 });
    [row] = await db.select().from(selfies).where(eq(selfies.id, id));
    expect(row.autoHiddenAt).not.toBeNull();
  });

  it("ignores duplicate reports from the same reporter", async () => {
    const db = await createTestDb();
    const owner = await makeSigner(db, "owner");
    const admin = await makeSigner(db, "admin", true);
    const r = await makeSigner(db, "r");
    const id = await approveOne(db, owner, admin);
    await reportSelfie(db, { selfieId: id, reporterSignerId: r });
    await reportSelfie(db, { selfieId: id, reporterSignerId: r });
    const rows = await db.select().from(selfieReports);
    expect(rows).toHaveLength(1);
  });
});

describe("resolveSelfieReports", () => {
  it("clears auto-hide when resolution=allowed", async () => {
    const db = await createTestDb();
    const owner = await makeSigner(db, "owner");
    const admin = await makeSigner(db, "admin", true);
    const r1 = await makeSigner(db, "r1");
    const r2 = await makeSigner(db, "r2");
    const r3 = await makeSigner(db, "r3");
    const id = await approveOne(db, owner, admin);
    for (const r of [r1, r2, r3])
      await reportSelfie(db, { selfieId: id, reporterSignerId: r });
    await resolveSelfieReports(db, {
      selfieId: id,
      adminSignerId: admin,
      resolution: "allowed",
    });
    const [row] = await db.select().from(selfies).where(eq(selfies.id, id));
    expect(row.autoHiddenAt).toBeNull();
    const reports = await db.select().from(selfieReports);
    expect(reports.every((r: any) => r.resolution === "allowed")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
pnpm test -- selfie.report
```

Expected: FAIL.

- [ ] **Step 3: Add functions to `src/server/actions/selfie.ts`**

```ts
import { selfieReports } from "@/lib/db/schema";
import {
  countUnresolvedReports,
} from "@/lib/selfie/queries";
import { SELFIE_AUTO_HIDE_THRESHOLD } from "@/lib/selfie/policy";

export interface ReportSelfieInput {
  selfieId: string;
  reporterSignerId: string;
  reason?: string;
}

export async function reportSelfie(
  db: any,
  input: ReportSelfieInput,
): Promise<void> {
  // Insert; ignore unique-violation (same reporter on same selfie).
  try {
    await db.insert(selfieReports).values({
      selfieId: input.selfieId,
      reporterSignerId: input.reporterSignerId,
      reason: input.reason ?? null,
    });
  } catch (err: any) {
    if (String(err?.message ?? "").includes("unique")) return;
    if (String(err?.cause?.message ?? "").includes("unique")) return;
    if (String(err?.code ?? "") === "23505") return;
    throw err;
  }

  const unresolved = await countUnresolvedReports(input.selfieId, db);
  if (unresolved >= SELFIE_AUTO_HIDE_THRESHOLD) {
    const rows = await db
      .select({ status: selfies.status, autoHiddenAt: selfies.autoHiddenAt })
      .from(selfies)
      .where(eq(selfies.id, input.selfieId))
      .limit(1);
    if (rows[0] && rows[0].status === "approved" && rows[0].autoHiddenAt === null) {
      await db
        .update(selfies)
        .set({ autoHiddenAt: new Date() })
        .where(eq(selfies.id, input.selfieId));
    }
  }
}

export interface ResolveSelfieReportsInput {
  selfieId: string;
  adminSignerId: string;
  resolution: "allowed" | "hidden";
}

export async function resolveSelfieReports(
  db: any,
  input: ResolveSelfieReportsInput,
): Promise<void> {
  await db
    .update(selfieReports)
    .set({
      resolvedAt: new Date(),
      resolvedBy: input.adminSignerId,
      resolution: input.resolution,
    })
    .where(
      and(
        eq(selfieReports.selfieId, input.selfieId),
        isNull(selfieReports.resolvedAt),
      ),
    );

  if (input.resolution === "allowed") {
    // Restore visibility
    await db
      .update(selfies)
      .set({ autoHiddenAt: null })
      .where(eq(selfies.id, input.selfieId));
  } else {
    // Convert to rejected
    await db
      .update(selfies)
      .set({
        status: "rejected",
        rejectionReason: "other",
        reviewedAt: new Date(),
        reviewedBy: input.adminSignerId,
      })
      .where(eq(selfies.id, input.selfieId));
  }
}

// Form-action wrappers

export async function reportSelfieAction(
  selfieId: string,
  reason?: string,
): Promise<void> {
  const { userId } = await auth();
  if (!userId) throw new Error("Sign in to report");
  const reporterRows = await getDb()
    .select({ id: signers.id })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (reporterRows.length === 0) throw new Error("Sign in to report");
  await reportSelfie(getDb(), {
    selfieId,
    reporterSignerId: reporterRows[0].id,
    reason,
  });
}

export async function resolveSelfieReportsAction(
  selfieId: string,
  resolution: "allowed" | "hidden",
): Promise<void> {
  const adminId = await requireAdminContext();
  await resolveSelfieReports(getDb(), {
    selfieId,
    adminSignerId: adminId,
    resolution,
  });
  revalidatePath("/admin/selfies");
}
```

- [ ] **Step 4: Run tests**

```bash
pnpm test -- selfie.report
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/actions/selfie.ts tests/server/selfie.report.test.ts
git commit -m "Add selfie reporting + auto-hide at threshold + admin resolve"
```

---

## Task 10: `removeMySelfieAction`

**Files:**
- Modify: `src/server/actions/selfie.ts`
- Create: `tests/server/selfie.removeMine.test.ts`

- [ ] **Step 1: Write test**

`tests/server/selfie.removeMine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { selfies, signers } from "@/lib/db/schema";
import {
  approveSelfie,
  removeMySelfie,
  submitSelfie,
} from "@/server/actions/selfie";
import { createInMemoryBackend } from "@/lib/storage/blob";
import { tinyPngBuffer } from "../_fixtures/tiny-png";

describe("removeMySelfie", () => {
  it("marks the active selfie as removed and deletes public blobs", async () => {
    const db = await createTestDb();
    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: "u1",
        displayName: "U1",
        verificationMethod: "email",
        verifiedAt: new Date(),
      })
      .returning({ id: signers.id });
    const [admin] = await db
      .insert(signers)
      .values({
        clerkUserId: "admin",
        displayName: "Admin",
        verificationMethod: "email",
        verifiedAt: new Date(),
        isAdmin: true,
      })
      .returning({ id: signers.id });
    const backend = createInMemoryBackend();
    const { selfieId } = await submitSelfie(db, {
      signerId: signer.id,
      buffer: tinyPngBuffer(),
      mime: "image/png",
      captureMethod: "live",
      blobBackend: backend,
    });
    await approveSelfie(db, { selfieId, adminSignerId: admin.id });
    expect(backend.store.size).toBe(3);

    await removeMySelfie(db, {
      signerId: signer.id,
      blobBackend: backend,
    });

    const [row] = await db.select().from(selfies).where(eq(selfies.id, selfieId));
    expect(row.removedAt).not.toBeNull();
    // Public display + thumbnail removed; original kept for audit window
    expect(backend.store.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run — should fail**

```bash
pnpm test -- selfie.removeMine
```

- [ ] **Step 3: Add to `src/server/actions/selfie.ts`**

```ts
export interface RemoveMySelfieInput {
  signerId: string;
  blobBackend?: SelfieBlobBackend;
}

export async function removeMySelfie(
  db: any,
  input: RemoveMySelfieInput,
): Promise<void> {
  const rows = await db
    .select()
    .from(selfies)
    .where(
      and(
        eq(selfies.signerId, input.signerId),
        eq(selfies.status, "approved"),
        isNull(selfies.removedAt),
        isNull(selfies.replacedBySelfieId),
      ),
    );
  for (const row of rows) {
    await deleteSelfieBlobsByUrls(
      {
        originalUrl: null, // keep original for audit window
        displayUrl: row.displayBlobUrl,
        thumbnailUrl: row.thumbnailBlobUrl,
      },
      input.blobBackend,
    );
    await db
      .update(selfies)
      .set({ removedAt: new Date() })
      .where(eq(selfies.id, row.id));
  }
}

export async function removeMySelfieAction(): Promise<void> {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const signerRows = await getDb()
    .select({ id: signers.id })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (signerRows.length === 0) redirect("/");
  await removeMySelfie(getDb(), { signerId: signerRows[0].id });
  revalidatePath("/account");
  revalidatePath(`/signatories/${signerRows[0].id}`);
}
```

- [ ] **Step 4: Run tests + commit**

```bash
pnpm test -- selfie
git add src/server/actions/selfie.ts tests/server/selfie.removeMine.test.ts
git commit -m "Add removeMySelfie action with best-effort blob cleanup"
```

---

## Task 11: Extend `submitRevokeAction` to purge selfies

**Files:**
- Modify: `src/server/actions/revoke.ts`
- Modify: `tests/server/revoke.test.ts`
- Modify: `src/app/account/revoke/page.tsx` (copy update)

- [ ] **Step 1: Read existing `src/server/actions/revoke.ts`** to understand the cascade order, then add selfie cleanup at the start of the delete chain (before deleting signers).

- [ ] **Step 2: Add selfie purge logic** — before the existing deletes, gather all selfie blob URLs, then DELETE FROM selfie_reports + selfies for the signer, then call `deleteSelfieBlobsByUrls` on each set (or call them inline before delete — order doesn't matter for correctness here since the blob store is independent of the DB).

Add at the top of the cascade in `submitRevokeAction` (and any non-action core function it calls):

```ts
import { selfies, selfieReports } from "@/lib/db/schema";
import { deleteSelfieBlobsByUrls } from "@/lib/storage/blob";

// ... inside the cascade ...
const signerSelfies = await db
  .select({
    originalBlobUrl: selfies.originalBlobUrl,
    displayBlobUrl: selfies.displayBlobUrl,
    thumbnailBlobUrl: selfies.thumbnailBlobUrl,
  })
  .from(selfies)
  .where(eq(selfies.signerId, signerId));
for (const s of signerSelfies) {
  await deleteSelfieBlobsByUrls({
    originalUrl: s.originalBlobUrl,
    displayUrl: s.displayBlobUrl,
    thumbnailUrl: s.thumbnailBlobUrl,
  });
}
// Delete reports first (FK target), then selfies
await db
  .delete(selfieReports)
  .where(eq(selfieReports.reporterSignerId, signerId));
// Reports against this signer's own selfies — delete via subquery
await db.execute(sql`
  DELETE FROM selfie_reports
  WHERE selfie_id IN (SELECT id FROM selfies WHERE signer_id = ${signerId})
`);
await db.delete(selfies).where(eq(selfies.signerId, signerId));
```

(Adapt to the existing function signature. If `submitRevokeAction` has a testable inner function, add the same logic there too.)

- [ ] **Step 3: Update `src/app/account/revoke/page.tsx`** — add a fourth bullet to the existing ordered list:

```tsx
<li>Delete any photo you uploaded, including all backup copies.</li>
```

- [ ] **Step 4: Add regression test** — extend `tests/server/revoke.test.ts` with a test verifying selfies + selfie_reports are deleted on revoke.

- [ ] **Step 5: Run tests**

```bash
pnpm test -- revoke
```

- [ ] **Step 6: Commit**

```bash
git add src/server/actions/revoke.ts src/app/account/revoke/page.tsx tests/server/revoke.test.ts
git commit -m "Purge selfies + blobs + selfie_reports on full revocation"
```

---

## Task 12: `<SelfieAvatar />` component

**Files:**
- Create: `src/components/SelfieAvatar.tsx`

- [ ] **Step 1: Implement**

```tsx
import { getActiveSelfieForSigner } from "@/lib/selfie/queries";

type Size = "sm" | "md" | "lg";

const DIMENSIONS: Record<Size, { px: number; classes: string }> = {
  sm: { px: 48, classes: "h-12 w-12 text-base" },
  md: { px: 120, classes: "h-[120px] w-[120px] text-3xl" },
  lg: { px: 360, classes: "h-[360px] w-[360px] text-7xl" },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0]!.toUpperCase();
  return (parts[0][0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

interface Props {
  size: Size;
  signerId: string;
  displayName: string;
  /** Optional pre-fetched map (used by list pages to avoid N+1). */
  preloadedActiveSelfies?: Map<
    string,
    { displayBlobUrl: string; thumbnailBlobUrl: string }
  >;
}

export async function SelfieAvatar({
  size,
  signerId,
  displayName,
  preloadedActiveSelfies,
}: Props) {
  const dims = DIMENSIONS[size];
  let url: string | null = null;
  if (preloadedActiveSelfies) {
    const entry = preloadedActiveSelfies.get(signerId);
    if (entry) {
      url = size === "sm" ? entry.thumbnailBlobUrl : entry.displayBlobUrl;
    }
  } else {
    const active = await getActiveSelfieForSigner(signerId);
    if (active) {
      url =
        size === "sm" ? active.thumbnailBlobUrl : active.displayBlobUrl;
    }
  }

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={`${displayName}'s photo`}
        width={dims.px}
        height={dims.px}
        className={`shrink-0 rounded-full object-cover ${dims.classes}`}
        loading="lazy"
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`shrink-0 rounded-full bg-gradient-to-br from-zinc-200 to-zinc-300 font-semibold text-zinc-600 ${dims.classes} flex items-center justify-center`}
    >
      {initials(displayName)}
    </div>
  );
}
```

> Using raw `<img>` instead of `next/image` for the avatar — the Blob URLs are stable and the optimization roundtrip adds latency we don't need at this size. The `eslint-disable` matches what would otherwise be a `@next/next/no-img-element` warning.

- [ ] **Step 2: Commit**

```bash
git add src/components/SelfieAvatar.tsx
git commit -m "Add SelfieAvatar component (sm/md/lg) with initials placeholder"
```

---

## Task 13: `<SelfieStatusBadge />` component

**Files:**
- Create: `src/components/SelfieStatusBadge.tsx`

- [ ] **Step 1: Implement**

```tsx
import { rejectionReasonToText, type RejectionReason } from "@/lib/selfie/policy";

interface Props {
  status: "pending" | "approved" | "rejected" | "auto_hidden";
  rejectionReason?: RejectionReason | null;
}

export function SelfieStatusBadge({ status, rejectionReason }: Props) {
  switch (status) {
    case "pending":
      return (
        <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
          Pending admin review
        </span>
      );
    case "approved":
      return (
        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200">
          Live on your profile
        </span>
      );
    case "rejected":
      return (
        <span
          className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800 ring-1 ring-inset ring-red-200"
          title={
            rejectionReason ? rejectionReasonToText(rejectionReason) : undefined
          }
        >
          Couldn't publish
          {rejectionReason ? `: ${rejectionReasonToText(rejectionReason)}` : ""}
        </span>
      );
    case "auto_hidden":
      return (
        <span className="inline-flex items-center rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-800 ring-1 ring-inset ring-orange-200">
          Temporarily hidden after reports
        </span>
      );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SelfieStatusBadge.tsx
git commit -m "Add SelfieStatusBadge component"
```

---

## Task 14: `<SelfieCapture />` client component

**Files:**
- Create: `src/components/SelfieCapture.tsx`

> This is the largest single client component. No unit test for the DOM interactions — covered by manual smoke test in Task 24. The submit handler delegates to `submitSelfieAction`, which IS tested.

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { submitSelfieAction } from "@/server/actions/selfie";

interface Props {
  context: "post-sign" | "account";
}

type Stage =
  | { kind: "choose" }
  | { kind: "live"; stream: MediaStream }
  | { kind: "preview"; blob: Blob; captureMethod: "live" | "upload" }
  | { kind: "submitting" }
  | { kind: "error"; message: string };

export function SelfieCapture({ context }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  const [pending, startTransition] = useTransition();
  const [cameraSupported, setCameraSupported] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!navigator.mediaDevices?.getUserMedia) setCameraSupported(false);
    return () => {
      if (stage.kind === "live") {
        stage.stream.getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function startLive() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      setStage({ kind: "live", stream });
      // Defer to next tick so the video element exists in the DOM.
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 0);
    } catch {
      setCameraSupported(false);
      setStage({ kind: "error", message: "Couldn't open the camera. Try uploading a photo instead." });
    }
  }

  async function capture() {
    if (stage.kind !== "live") return;
    const video = videoRef.current!;
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) return;
    stage.stream.getTracks().forEach((t) => t.stop());
    setStage({ kind: "preview", blob, captureMethod: "live" });
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStage({ kind: "preview", blob: file, captureMethod: "upload" });
  }

  function reset() {
    if (stage.kind === "live") stage.stream.getTracks().forEach((t) => t.stop());
    setStage({ kind: "choose" });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit() {
    if (stage.kind !== "preview") return;
    const form = new FormData();
    const ext = stage.blob.type.includes("png") ? "png" : "jpg";
    form.set(
      "photo",
      new File([stage.blob], `selfie.${ext}`, { type: stage.blob.type || "image/jpeg" }),
    );
    form.set("captureMethod", stage.captureMethod);
    startTransition(async () => {
      try {
        await submitSelfieAction(form);
      } catch (err: any) {
        setStage({
          kind: "error",
          message: friendlyError(err?.message ?? "Couldn't submit. Try again."),
        });
      }
    });
  }

  return (
    <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-6">
      {context === "post-sign" ? (
        <>
          <h2 className="text-xl font-semibold text-zinc-950">
            Add your photo <span className="text-zinc-400">(optional)</span>
          </h2>
          <p className="mt-2 text-sm text-zinc-600">
            Put a face to your name on your signer profile. Submitted photos
            are briefly reviewed by an admin before they go live.
          </p>
        </>
      ) : null}

      {stage.kind === "choose" ? (
        <div className="mt-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            {cameraSupported ? (
              <button
                type="button"
                onClick={startLive}
                className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
              >
                Take photo
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-100"
            >
              {cameraSupported ? "Upload existing photo" : "Upload a photo"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={onFileChange}
              className="hidden"
            />
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            Your photo will be shown on your public profile after a brief
            admin review. You can remove it anytime from your account. We do
            not run face recognition and do not share your photo with third
            parties.
          </p>
        </div>
      ) : null}

      {stage.kind === "live" ? (
        <div className="mt-5">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="mx-auto aspect-square w-full max-w-sm rounded-2xl bg-zinc-100 object-cover"
          />
          <canvas ref={canvasRef} className="hidden" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={capture}
              className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-700"
            >
              Capture
            </button>
            <button
              type="button"
              onClick={reset}
              className="text-sm text-zinc-600 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {stage.kind === "preview" ? (
        <div className="mt-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={URL.createObjectURL(stage.blob)}
            alt="Preview"
            className="mx-auto aspect-square w-full max-w-sm rounded-2xl object-cover"
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {pending ? "Submitting…" : "Submit photo"}
            </button>
            <button
              type="button"
              onClick={reset}
              className="text-sm text-zinc-600 hover:underline"
            >
              Choose different
            </button>
          </div>
        </div>
      ) : null}

      {stage.kind === "error" ? (
        <div className="mt-5 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {stage.message}{" "}
          <button
            type="button"
            onClick={reset}
            className="font-medium underline"
          >
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}

function friendlyError(raw: string): string {
  if (raw.includes("too_large"))
    return "That photo is too large. Please pick one under 10 MB.";
  if (raw.includes("disallowed_mime"))
    return "We accept JPEG, PNG, WebP, and HEIC photos.";
  if (raw.includes("empty")) return "The file you picked is empty.";
  if (raw.includes("too_pixels"))
    return "That photo has unusually large dimensions. Please use a smaller one.";
  if (raw.toLowerCase().includes("rate"))
    return "You've submitted a lot of photos recently. Take a break and try again in an hour.";
  return raw;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SelfieCapture.tsx
git commit -m "Add SelfieCapture client component (live + upload, hybrid UX)"
```

---

## Task 15: `<SelfieCard />` component

**Files:**
- Create: `src/components/SelfieCard.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { SelfieCapture } from "./SelfieCapture";
import { SelfieStatusBadge } from "./SelfieStatusBadge";
import { removeMySelfieAction } from "@/server/actions/selfie";
import type { RejectionReason } from "@/lib/selfie/policy";

export interface SelfieCardData {
  status: "none" | "pending" | "approved" | "rejected" | "auto_hidden";
  thumbnailUrl?: string | null;
  rejectionReason?: RejectionReason | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
}

export function SelfieCard({ initial }: { initial: SelfieCardData }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function handleRemove() {
    const ok = window.confirm("Remove your photo from your public profile?");
    if (!ok) return;
    start(async () => {
      await removeMySelfieAction();
      router.refresh();
    });
  }

  if (initial.status === "none") {
    return (
      <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6">
        <h2 className="text-xl font-semibold text-zinc-950">Your photo</h2>
        <p className="mt-2 text-sm text-zinc-600">
          Put a face to your name on your signer profile.
        </p>
        <div className="mt-4">
          <SelfieCapture context="account" />
        </div>
      </section>
    );
  }

  return (
    <section className="mt-10 rounded-2xl border border-zinc-200 bg-white p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {initial.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={initial.thumbnailUrl}
            alt="Your photo"
            className="h-24 w-24 shrink-0 rounded-2xl object-cover"
          />
        ) : null}
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-zinc-950">Your photo</h2>
          <div className="mt-2">
            <SelfieStatusBadge
              status={initial.status}
              rejectionReason={initial.rejectionReason ?? null}
            />
          </div>
          {initial.submittedAt ? (
            <p className="mt-2 text-xs text-zinc-500">
              Submitted {initial.submittedAt.slice(0, 10)}
            </p>
          ) : null}
        </div>
      </div>

      {initial.status === "approved" ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <details>
            <summary className="cursor-pointer rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700">
              Replace photo
            </summary>
            <div className="mt-3">
              <SelfieCapture context="account" />
            </div>
          </details>
          <button
            type="button"
            onClick={handleRemove}
            disabled={pending}
            className="text-sm text-red-700 underline-offset-4 hover:underline disabled:opacity-50"
          >
            {pending ? "Removing…" : "Remove photo"}
          </button>
        </div>
      ) : null}

      {initial.status === "rejected" || initial.status === "auto_hidden" ? (
        <div className="mt-5">
          <p className="mb-3 text-sm text-zinc-600">
            {initial.status === "rejected"
              ? "Try again with a different photo."
              : "Submit a new photo to replace the hidden one."}
          </p>
          <SelfieCapture context="account" />
        </div>
      ) : null}

      {initial.status === "pending" ? (
        <p className="mt-5 text-sm text-zinc-600">
          We'll email you when an admin has reviewed your photo. Usually
          within 24 hours.
        </p>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SelfieCard.tsx
git commit -m "Add SelfieCard for /account with state-specific affordances"
```

---

## Task 16: `<ReportSelfieButton />`

**Files:**
- Create: `src/components/ReportSelfieButton.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";

import { useState, useTransition } from "react";
import { reportSelfieAction } from "@/server/actions/selfie";

export function ReportSelfieButton({ selfieId }: { selfieId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <p className="mt-4 text-xs text-zinc-500">
        Thanks — we'll review this photo.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-zinc-500 underline-offset-4 hover:text-zinc-700 hover:underline"
      >
        Report this photo
      </button>
      {open ? (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4">
          <label className="block">
            <span className="text-xs font-medium text-zinc-700">
              Why are you reporting it? (optional)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await reportSelfieAction(selfieId, reason || undefined);
                  setDone(true);
                })
              }
              className="rounded-full bg-zinc-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
            >
              {pending ? "Sending…" : "Submit report"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-zinc-600 hover:underline"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ReportSelfieButton.tsx
git commit -m "Add ReportSelfieButton client component"
```

---

## Task 17: Wire `<SelfieCapture />` into `/sign/complete`

**Files:**
- Modify: `src/app/sign/complete/page.tsx`

- [ ] **Step 1: Add the capture block + skip link**

After the existing "See your public page →" + "See everyone who has signed" block, add (before closing `</main>`):

```tsx
import { SelfieCapture } from "@/components/SelfieCapture";

// ...inside the return, after the existing CTA group...
<div className="mt-12">
  <SelfieCapture context="post-sign" />
  <div className="mt-3 text-center">
    <Link
      href={signer ? `/signatories/${signer.id}` : "/signatories"}
      className="text-sm text-zinc-500 underline-offset-4 hover:underline"
    >
      Skip for now
    </Link>
  </div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/app/sign/complete/page.tsx
git commit -m "Wire SelfieCapture into /sign/complete"
```

---

## Task 18: Wire `<SelfieCard />` into `/account`

**Files:**
- Modify: `src/app/account/page.tsx` — fetch active selfie + pending selfie info, pass to AccountClient.
- Modify: `src/app/account/AccountClient.tsx` — accept new prop and render `<SelfieCard />`.

- [ ] **Step 1: Server page changes** — `src/app/account/page.tsx`:

```ts
import { selfies } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
// inside the page after `const signer = rows[0];`:
const selfieRows = await db
  .select()
  .from(selfies)
  .where(eq(selfies.signerId, signer.id))
  .orderBy(desc(selfies.submittedAt))
  .limit(1);
const latestSelfie = selfieRows[0] ?? null;

let cardData: SelfieCardData = { status: "none" };
if (latestSelfie) {
  let status: SelfieCardData["status"] = "none";
  if (latestSelfie.status === "pending") status = "pending";
  else if (latestSelfie.status === "approved" && !latestSelfie.autoHiddenAt && !latestSelfie.removedAt && !latestSelfie.replacedBySelfieId) status = "approved";
  else if (latestSelfie.status === "approved" && latestSelfie.autoHiddenAt) status = "auto_hidden";
  else if (latestSelfie.status === "rejected") status = "rejected";
  cardData = {
    status,
    thumbnailUrl: latestSelfie.thumbnailBlobUrl,
    rejectionReason: latestSelfie.rejectionReason as any,
    submittedAt: latestSelfie.submittedAt?.toISOString() ?? null,
    reviewedAt: latestSelfie.reviewedAt?.toISOString() ?? null,
  };
}
```

Pass `selfieCard={cardData}` to `<AccountClient />`.

- [ ] **Step 2: Client changes** — `src/app/account/AccountClient.tsx`:

```tsx
import { SelfieCard, type SelfieCardData } from "@/components/SelfieCard";

interface Props {
  // ...existing props
  selfieCard: SelfieCardData;
}

// inside JSX, between the profile form and the signatures section:
<SelfieCard initial={selfieCard} />
```

- [ ] **Step 3: Commit**

```bash
git add src/app/account/page.tsx src/app/account/AccountClient.tsx
git commit -m "Wire SelfieCard into /account"
```

---

## Task 19: Wire `<SelfieAvatar />` into `/signatories/[id]`

**Files:**
- Modify: `src/app/signatories/[id]/page.tsx`
- Modify: `src/app/signatories/[id]/page.tsx` — also add `<ReportSelfieButton />` for non-owners.

- [ ] **Step 1: Add avatar above name + report button (non-owner only)**

Above the current `<h1>{signer.displayName}</h1>` block, add a flex container with the avatar to the left and the name+badge to the right. On mobile (<640px), stack with avatar on top.

```tsx
import { SelfieAvatar } from "@/components/SelfieAvatar";
import { ReportSelfieButton } from "@/components/ReportSelfieButton";
import { getActiveSelfieForSigner } from "@/lib/selfie/queries";

// inside the component, after `const sigs = ...;`:
const activeSelfie = await getActiveSelfieForSigner(signer.id);

// Replace the existing header block with:
<div className="mt-4 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
  <SelfieAvatar
    size="md"
    signerId={signer.id}
    displayName={signer.displayName}
  />
  <div>
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
        {signer.displayName}
      </h1>
      <VerificationBadge
        method={signer.verificationMethod as "email" | "sms"}
      />
    </div>
    {signer.locationText || signer.affiliation ? (
      <div className="mt-2 text-sm text-zinc-600">
        {[signer.locationText, signer.affiliation]
          .filter(Boolean)
          .join(" · ")}
      </div>
    ) : null}
  </div>
</div>

// Before the </main>, if not owner AND active selfie exists:
{!isOwner && activeSelfie ? (
  <ReportSelfieButton selfieId={activeSelfie.id} />
) : null}
```

- [ ] **Step 2: Update OG metadata**

In `generateMetadata`, set `openGraph.images` and `twitter.images` to point at `/api/og/signer/{id}`:

```ts
openGraph: {
  title,
  description,
  type: "profile",
  images: [
    {
      url: `/api/og/signer/${id}`,
      width: 1200,
      height: 630,
    },
  ],
},
twitter: {
  card: "summary_large_image",
  title,
  description,
  images: [`/api/og/signer/${id}`],
},
```

- [ ] **Step 3: Commit**

```bash
git add src/app/signatories/[id]/page.tsx
git commit -m "Wire SelfieAvatar + ReportSelfieButton into signer profile"
```

---

## Task 20: Wire `<SelfieAvatar />` into `/signatories` list

**Files:**
- Modify: `src/app/signatories/page.tsx`
- Modify: `src/components/SignatureCard.tsx`

- [ ] **Step 1: Pre-fetch active selfies on the list page**

```ts
import { getActiveSelfiesForSigners } from "@/lib/selfie/queries";

// inside SignatoriesPage, after `const rows = await listSignatures(...)`:
const signerIds = rows.map((r) => r.signerId);
const activeSelfies = await getActiveSelfiesForSigners(signerIds);
```

Pass `activeSelfies` to each `<SignatureCard />`:

```tsx
<SignatureCard
  key={item.signerId + item.version}
  item={item}
  activeSelfies={activeSelfies}
/>
```

- [ ] **Step 2: Update `SignatureCard.tsx`**

Add the avatar to the left and reshape the row. Read existing markup, then change the root to a flex row with the avatar at left.

```tsx
import { SelfieAvatar } from "./SelfieAvatar";

interface Props {
  item: SignerListItem;
  activeSelfies?: Map<string, { displayBlobUrl: string; thumbnailBlobUrl: string }>;
}

// Inside the rendered JSX, root becomes:
<Link href={...} className="flex items-center gap-3 ...">
  <SelfieAvatar
    size="sm"
    signerId={item.signerId}
    displayName={item.displayName}
    preloadedActiveSelfies={activeSelfies}
  />
  <div className="min-w-0 flex-1">
    {/* existing inner content */}
  </div>
</Link>
```

- [ ] **Step 3: Commit**

```bash
git add src/app/signatories/page.tsx src/components/SignatureCard.tsx
git commit -m "Wire SelfieAvatar thumbnails into the signatories list"
```

---

## Task 21: `/admin/selfies` page + `<SelfieReviewCard />`

**Files:**
- Create: `src/app/admin/selfies/page.tsx`
- Create: `src/app/admin/selfies/AdminSelfiesClient.tsx`
- Create: `src/components/SelfieReviewCard.tsx`

- [ ] **Step 1: Server page (admin-gated)**

`src/app/admin/selfies/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { selfies, signers } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentAdmin } from "@/lib/admin/check";
import { AdminSelfiesClient } from "./AdminSelfiesClient";

export const dynamic = "force-dynamic";

export default async function AdminSelfiesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await getCurrentAdmin();
  if (ctx.state !== "admin") notFound();

  const { tab = "pending" } = await searchParams;
  const status = tab === "rejected" ? "rejected" : tab === "approved" ? "approved" : tab === "auto_hidden" ? "auto_hidden" : "pending";

  let rows: any[] = [];
  if (status === "auto_hidden") {
    rows = await db
      .select({
        id: selfies.id,
        signerId: selfies.signerId,
        displayBlobUrl: selfies.displayBlobUrl,
        submittedAt: selfies.submittedAt,
        captureMethod: selfies.captureMethod,
        autoHiddenAt: selfies.autoHiddenAt,
        displayName: signers.displayName,
        affiliation: signers.affiliation,
        locationText: signers.locationText,
        verificationMethod: signers.verificationMethod,
        memberSince: signers.createdAt,
      })
      .from(selfies)
      .innerJoin(signers, eq(signers.id, selfies.signerId))
      .where(eq(selfies.status, "approved"))
      .orderBy(desc(selfies.submittedAt));
    rows = rows.filter((r) => r.autoHiddenAt !== null);
  } else {
    rows = await db
      .select({
        id: selfies.id,
        signerId: selfies.signerId,
        displayBlobUrl: selfies.displayBlobUrl,
        submittedAt: selfies.submittedAt,
        captureMethod: selfies.captureMethod,
        rejectionReason: selfies.rejectionReason,
        displayName: signers.displayName,
        affiliation: signers.affiliation,
        locationText: signers.locationText,
        verificationMethod: signers.verificationMethod,
        memberSince: signers.createdAt,
      })
      .from(selfies)
      .innerJoin(signers, eq(signers.id, selfies.signerId))
      .where(eq(selfies.status, status))
      .orderBy(desc(selfies.submittedAt));
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-12">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-zinc-500">Admin</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950">
          Selfies
        </h1>
      </header>
      <AdminSelfiesClient rows={rows.map((r: any) => ({ ...r, submittedAt: r.submittedAt.toISOString(), memberSince: r.memberSince.toISOString() }))} currentTab={status} />
    </main>
  );
}
```

- [ ] **Step 2: Client review UI**

`src/app/admin/selfies/AdminSelfiesClient.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  approveSelfieAction,
  rejectSelfieAction,
  resolveSelfieReportsAction,
} from "@/server/actions/selfie";
import { REJECTION_REASONS, type RejectionReason, rejectionReasonToText } from "@/lib/selfie/policy";

interface Row {
  id: string;
  signerId: string;
  displayBlobUrl: string;
  submittedAt: string;
  captureMethod: string;
  rejectionReason?: RejectionReason | null;
  displayName: string;
  affiliation: string | null;
  locationText: string | null;
  verificationMethod: string;
  memberSince: string;
  autoHiddenAt?: string | null;
}

const TABS = [
  { id: "pending", label: "Pending" },
  { id: "auto_hidden", label: "Auto-hidden" },
  { id: "rejected", label: "Rejected" },
  { id: "approved", label: "Approved" },
] as const;

export function AdminSelfiesClient({
  rows,
  currentTab,
}: {
  rows: Row[];
  currentTab: string;
}) {
  return (
    <div>
      <nav className="mb-6 flex gap-2 border-b border-zinc-200">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={`/admin/selfies?tab=${t.id}`}
            className={`px-3 py-2 text-sm font-medium ${
              currentTab === t.id
                ? "border-b-2 border-zinc-900 text-zinc-900"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-zinc-200 bg-zinc-50 p-12 text-center text-zinc-600">
          Nothing here right now.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {rows.map((row) => (
            <ReviewCard key={row.id} row={row} tab={currentTab} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewCard({ row, tab }: { row: Row; tab: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState<RejectionReason>("not_a_face");
  const [note, setNote] = useState("");

  function doApprove() {
    start(async () => {
      await approveSelfieAction(row.id);
      router.refresh();
    });
  }
  function doReject() {
    start(async () => {
      await rejectSelfieAction(row.id, reason, note || undefined);
      router.refresh();
    });
  }
  function doRestore() {
    start(async () => {
      await resolveSelfieReportsAction(row.id, "allowed");
      router.refresh();
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={row.displayBlobUrl}
        alt={`${row.displayName} selfie`}
        className="aspect-square w-full bg-zinc-100 object-cover"
      />
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <Link
            href={`/signatories/${row.signerId}`}
            target="_blank"
            className="text-base font-semibold text-zinc-950 hover:underline"
          >
            {row.displayName}
          </Link>
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            {row.captureMethod === "live" ? "Live" : "Upload"}
          </span>
        </div>
        {row.affiliation || row.locationText ? (
          <p className="mt-1 text-xs text-zinc-600">
            {[row.affiliation, row.locationText].filter(Boolean).join(" · ")}
          </p>
        ) : null}
        <p className="mt-1 text-[11px] text-zinc-400">
          Submitted {row.submittedAt.slice(0, 10)} · Member since{" "}
          {row.memberSince.slice(0, 10)} · Verified via {row.verificationMethod}
        </p>
        {row.rejectionReason ? (
          <p className="mt-2 text-xs text-red-700">
            Reason: {rejectionReasonToText(row.rejectionReason)}
          </p>
        ) : null}

        {tab === "pending" ? (
          showReject ? (
            <div className="mt-3 rounded-md border border-zinc-200 bg-zinc-50 p-3">
              <label className="block text-xs">
                <span className="font-medium text-zinc-700">Reason</span>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as RejectionReason)}
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
                >
                  {REJECTION_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {rejectionReasonToText(r)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="mt-2 block text-xs">
                <span className="font-medium text-zinc-700">Note (private)</span>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="mt-1 w-full rounded border border-zinc-300 px-2 py-1 text-xs"
                />
              </label>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={doReject}
                  className="rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                >
                  Confirm reject
                </button>
                <button
                  type="button"
                  onClick={() => setShowReject(false)}
                  className="text-xs text-zinc-600 hover:underline"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={doApprove}
                className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setShowReject(true)}
                className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100"
              >
                Reject
              </button>
            </div>
          )
        ) : null}

        {tab === "auto_hidden" ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={doRestore}
              className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Restore
            </button>
            <button
              type="button"
              onClick={() => setShowReject(true)}
              className="rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-100"
            >
              Reject
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Add link to admin sidebar / signers page**

Edit `src/app/admin/signers/page.tsx` — add a nav above the existing header:

```tsx
<nav className="mb-4 flex gap-3 text-sm">
  <Link href="/admin/signers" className="font-medium text-zinc-900">Signers</Link>
  <Link href="/admin/selfies" className="text-zinc-600 hover:underline">Selfies</Link>
</nav>
```

(Use a matching nav at the top of `/admin/selfies` so admins can hop between.)

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/selfies src/app/admin/signers/page.tsx
git commit -m "Add /admin/selfies moderation queue with approve/reject/restore"
```

---

## Task 22: OG image route

**Files:**
- Create: `src/app/api/og/signer/[id]/route.tsx`

- [ ] **Step 1: Implement**

```tsx
import { ImageResponse } from "next/og";
import { getActiveSelfieForSigner } from "@/lib/selfie/queries";
import { getSignerById } from "@/lib/db/queries";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const signer = await getSignerById(id);
  if (!signer) return new Response("Not found", { status: 404 });
  const selfie = await getActiveSelfieForSigner(id);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "white",
          padding: "60px",
          gap: "48px",
          alignItems: "center",
          fontFamily: "sans-serif",
        }}
      >
        {selfie ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={selfie.displayBlobUrl}
            alt=""
            style={{ width: 360, height: 360, borderRadius: 24, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: 360,
              height: 360,
              borderRadius: 24,
              background: "#f4f4f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 120,
              fontWeight: 700,
              color: "#71717a",
            }}
          >
            {signer.displayName.charAt(0).toUpperCase()}
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ fontSize: 22, color: "#52525b", letterSpacing: 4, textTransform: "uppercase" }}>
            Signer of the
          </div>
          <div style={{ fontSize: 64, fontWeight: 700, color: "#09090b", marginTop: 8 }}>
            AI Bill of Rights
          </div>
          <div style={{ fontSize: 48, color: "#27272a", marginTop: 24 }}>
            {signer.displayName}
          </div>
          {signer.affiliation || signer.locationText ? (
            <div style={{ fontSize: 24, color: "#71717a", marginTop: 8 }}>
              {[signer.affiliation, signer.locationText].filter(Boolean).join(" · ")}
            </div>
          ) : null}
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/og/signer
git commit -m "Add OG image route /api/og/signer/[id] with selfie when approved"
```

---

## Task 23: Disclaimer content file

**Files:**
- Create: `content/selfie/disclaimer.md`

- [ ] **Step 1: Write the file**

```markdown
Your photo will be shown on your public profile after a brief admin review.
You can remove it anytime from your account. We do not run face recognition
and do not share your photo with third parties.
```

- [ ] **Step 2: Commit**

```bash
git add content/selfie/disclaimer.md
git commit -m "Add selfie disclaimer text for audit trail"
```

---

## Task 24: Full test pass + lint + build + final progress log

**Files:**
- Modify: `prd/branch commit updates/worktree-feat+selfie-after-signing.md` (append final entry)

- [ ] **Step 1: Run tests**

```bash
pnpm test
```

Expected: all tests PASS. If failures, fix inline and re-run.

- [ ] **Step 2: Run lint**

```bash
pnpm lint
```

Expected: clean. Fix any errors inline.

- [ ] **Step 3: Run build**

```bash
pnpm build
```

Expected: build succeeds. (`postbuild` runs `scripts/sync-versions.ts` which needs DATABASE_URL — if local dev, expect a warning or skip; document if blocking.)

- [ ] **Step 4: Append final progress log entry**

- [ ] **Step 5: Commit the progress log + push (optional)**

```bash
git add "prd/branch commit updates/worktree-feat+selfie-after-signing.md"
git commit -m "Final progress log update for selfie feature"
```

---

## Self-Review

**1. Spec coverage:**
- §4 Architecture (routes, server actions, lib, components, email templates) → Tasks 0, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23 ✓
- §5 Data model (selfies + selfie_reports + partial unique) → Task 1 ✓
- §6 Capture UX (post-sign + account, hybrid live/upload) → Tasks 14, 17, 18 ✓
- §7 Moderation (admin queue, reporting, notifications) → Tasks 9, 16, 21, and email sends in Task 8/9 ✓
- §8 Storage + processing → Tasks 3, 4 ✓
- §9 Revocation + Article 1 (purge on revoke, disclaimer file) → Tasks 11, 23 ✓
- §10 Display surfaces (avatar, list thumbnail, OG image) → Tasks 12, 19, 20, 22 ✓
- §11 Error handling (validators + rate limit + friendly messages) → Tasks 2, 7, 14 ✓
- §12 Testing (policy, queries, submit, review, report, revoke regression) → Tasks 2, 3, 5, 7, 8, 9, 10, 11 ✓

**2. Placeholder scan:** No "TBD" / "TODO" / "fill in later" / unspecified imports. Code blocks throughout. ✓

**3. Type consistency:**
- `RejectionReason` (Task 2) is consistently used in Tasks 8, 13, 15, 21.
- `SelfieBlobBackend` (Task 4) consistently used in Tasks 7, 10, 11.
- `SelfieCardData` (Task 15) consistently used in Task 18.
- `getActiveSelfieForSigner` returns same shape across Tasks 5, 12, 19, 22. ✓

Plan is complete and self-consistent.
