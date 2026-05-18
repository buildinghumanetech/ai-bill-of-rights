# Phase 2 — Implement-as-Code + Attestations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the "Implement as Code" surface and the public attestations registry. AI builders can land on `/v/[version]/as-code`, copy or `curl` a versioned `agents.md` (LLM instruction file) and `spec.json` (machine-readable spec), then submit a public attestation that their product adheres to that version. Verified attestations appear on `/attestations`; claims naming frontier labs queue for manual admin review before going public.

**Architecture:** New `attestations` table; new routes `/v/[version]/as-code`, `/v/[version]/agents.md`, `/v/[version]/spec.json`, `/attestations`, `/attestations/verify/[token]`, `/admin/attestations`. The raw markdown/json files are streamed from the cached `versions` row (they're already hashed and synced from `content/bill-of-rights/`); no new sync infrastructure needed. Email verification uses an opaque UUID token stored on the attestation row — no JWT signing.

**Tech Stack:** Existing Phase 1 stack — Next.js 16, Clerk, Neon + Drizzle, Resend. Two new column additions to `attestations`, no new dependencies.

**Reference:** Implements Section 9 of `docs/superpowers/specs/2026-05-18-ai-bill-of-rights-design.md`. Branches off `feat/phase-1-signable-mvp` (depends on its schema, queries, and seeded `versions.parsedJson`).

---

## File structure (created or modified)

```
src/
├── app/
│   ├── page.tsx                                   # Modify: add "Building AI?" secondary CTA
│   ├── attestations/
│   │   ├── page.tsx                               # Create: public list
│   │   └── verify/[token]/page.tsx                # Create: email-link landing page
│   ├── v/[version]/
│   │   ├── page.tsx                               # Modify: add "Implement as Code" button
│   │   ├── as-code/page.tsx                       # Create: copy/download/attest UI
│   │   ├── agents.md/route.ts                     # Create: raw GET
│   │   └── spec.json/route.ts                     # Create: raw GET
│   └── admin/attestations/page.tsx                # Create: admin review queue
├── lib/
│   ├── db/
│   │   ├── schema.ts                              # Modify: add attestations table
│   │   └── queries.ts                             # Modify: add listAttestations etc.
│   ├── attestations/
│   │   ├── allowlist.ts                           # Create: frontier-lab name allowlist
│   │   └── token.ts                               # Create: opaque token helpers
│   └── email/templates.ts                         # Modify: add attestationVerify template
├── server/actions/
│   └── attestations.ts                            # Create: submit/verify/approve/hide actions
├── components/
│   ├── AttestationCard.tsx                        # Create
│   ├── AsCodeButton.tsx                           # Create
│   └── AttestationForm.tsx                        # Create
└── tests/
    ├── lib/db.queries.attestations.test.ts        # Create
    ├── lib/attestations.allowlist.test.ts         # Create
    └── server/attestations.test.ts                # Create

content/bill-of-rights/v1.0.0.agents.md            # Already exists (stub from Plan 1)
content/bill-of-rights/v1.0.0.spec.json            # Already exists (stub from Plan 1)

drizzle/0001_*.sql                                 # Generated in Task 2
```

---

## Task 1: Add `attestations` table to schema + pglite helper

**Files:** `src/lib/db/schema.ts`, `tests/_helpers/pglite-db.ts`

- [ ] **Step 1: Append to `src/lib/db/schema.ts`**

```typescript
export const attestations = pgTable("attestations", {
  id: uuid("id").defaultRandom().primaryKey(),
  orgName: text("org_name").notNull(),
  productName: text("product_name").notNull(),
  productUrl: text("product_url"),
  versionId: uuid("version_id")
    .notNull()
    .references(() => versions.id),
  contactEmail: text("contact_email").notNull(),
  verificationToken: text("verification_token").notNull().unique(),
  claimedAt: timestamp("claimed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  needsManualReview: boolean("needs_manual_review").notNull().default(false),
  manuallyReviewedAt: timestamp("manually_reviewed_at", { withTimezone: true }),
  manuallyApproved: boolean("manually_approved"),
  published: boolean("published").notNull().default(false),
  hiddenAt: timestamp("hidden_at", { withTimezone: true }),
});
```

- [ ] **Step 2: Append the table DDL to `tests/_helpers/pglite-db.ts` inside the `db.execute(sql\`...\`)` block:**

```sql
create table attestations (
  id uuid primary key default gen_random_uuid(),
  org_name text not null,
  product_name text not null,
  product_url text,
  version_id uuid not null references versions(id),
  contact_email text not null,
  verification_token text not null unique,
  claimed_at timestamptz not null default now(),
  email_verified_at timestamptz,
  needs_manual_review boolean not null default false,
  manually_reviewed_at timestamptz,
  manually_approved boolean,
  published boolean not null default false,
  hidden_at timestamptz
);
create index attestations_version_published
  on attestations (version_id) where published = true;
```

- [ ] **Step 3: Update `tests/lib/db.schema.test.ts`** — add `expect(schema.attestations).toBeDefined();` to the "exports all Phase 1 tables" assertion (rename block to "exports all current tables"). Run `pnpm test tests/lib/db.schema.test.ts` — must pass.

- [ ] **Step 4: Update progress log + commit**

```bash
git add src/lib/db/schema.ts tests/_helpers/pglite-db.ts tests/lib/db.schema.test.ts "prd/branch commit updates/feat/phase-2-as-code-attestations.md"
git commit -m "Add attestations table to schema"
```

The progress log doesn't exist yet for this branch — create it with header `# Branch Progress: feat/phase-2-as-code-attestations` and the first entry.

---

## Task 2: Generate migration `0001_*.sql`

**Files:** `drizzle/0001_*.sql`

- [ ] **Step 1:** `pnpm db:generate` — inspect the produced SQL; confirm it only adds `attestations` (no destructive changes to Phase 1 tables).

- [ ] **Step 2: Apply to Neon dev DB:** `pnpm db:push` (idempotent — adds the new table without touching existing data).

- [ ] **Step 3: Commit**

```bash
git add drizzle "prd/branch commit updates/feat/phase-2-as-code-attestations.md"
git commit -m "Generate migration for attestations table"
```

---

## Task 3: Frontier-lab allowlist + opaque-token helper

**Files:** `src/lib/attestations/allowlist.ts`, `src/lib/attestations/token.ts`, `tests/lib/attestations.allowlist.test.ts`

- [ ] **Step 1: Write the test for the allowlist matcher**

`tests/lib/attestations.allowlist.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { needsManualReview } from "@/lib/attestations/allowlist";

describe("needsManualReview", () => {
  it("matches exact frontier-lab names case-insensitively", () => {
    expect(needsManualReview("OpenAI")).toBe(true);
    expect(needsManualReview("anthropic")).toBe(true);
    expect(needsManualReview("Google DeepMind")).toBe(true);
  });
  it("matches when frontier-lab name is a token in a longer string", () => {
    expect(needsManualReview("OpenAI Engineering")).toBe(true);
    expect(needsManualReview("Anthropic Public Benefit Corp")).toBe(true);
  });
  it("does not match unrelated org names", () => {
    expect(needsManualReview("María's Coffee Shop")).toBe(false);
    expect(needsManualReview("Random Startup Inc")).toBe(false);
  });
  it("does not match casual mentions like 'we use OpenAI's API' (treat as substring)", () => {
    // We intentionally err toward broader review-gating rather than letting impersonation slip
    expect(needsManualReview("We use OpenAI's API")).toBe(true);
  });
});
```

- [ ] **Step 2: Write `src/lib/attestations/allowlist.ts`**

```typescript
export const FRONTIER_LAB_NAMES = [
  "openai",
  "anthropic",
  "google",
  "deepmind",
  "google deepmind",
  "meta",
  "amazon",
  "microsoft",
  "apple",
  "mistral",
  "xai",
  "x.ai",
  "cohere",
  "perplexity",
  "inflection",
  "stability",
  "stability ai",
];

/**
 * Returns true if the org name plausibly claims to be one of the frontier
 * AI labs. We err on the side of false-positives — manual review by an admin
 * is the safety valve, and the cost of a delay is much lower than the cost
 * of a false attestation going public.
 */
export function needsManualReview(orgName: string): boolean {
  const lower = orgName.toLowerCase();
  return FRONTIER_LAB_NAMES.some((name) =>
    new RegExp(`\\b${name.replace(/\./g, "\\.")}\\b`, "i").test(lower),
  );
}
```

Run: `pnpm test tests/lib/attestations.allowlist.test.ts` — all pass.

- [ ] **Step 3: Write `src/lib/attestations/token.ts`** (no tests — it wraps `crypto.randomUUID`)

```typescript
import { randomUUID } from "node:crypto";

/**
 * Generates an opaque, single-use verification token for attestation email
 * confirmation links. Stored on the `verification_token` column (UNIQUE).
 * Has no embedded claims — lookup-only.
 */
export function generateVerificationToken(): string {
  // 32 hex chars from a v4 uuid (no hyphens) is plenty of entropy.
  return randomUUID().replace(/-/g, "");
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/attestations tests/lib/attestations.allowlist.test.ts "prd/branch commit updates/feat/phase-2-as-code-attestations.md"
git commit -m "Add frontier-lab allowlist and verification-token helper"
```

---

## Task 4: Attestation server actions

**Files:** `src/server/actions/attestations.ts`, `tests/server/attestations.test.ts`, `src/lib/email/templates.ts`

- [ ] **Step 1: Write the tests**

`tests/server/attestations.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import { attestations } from "@/lib/db/schema";
import {
  createAttestation,
  verifyAttestationToken,
  approveAttestation,
  hideAttestation,
} from "@/server/actions/attestations";

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
      publishedAt: new Date(),
      markdown: sampleMarkdown,
      agentsMd: "stub",
      specJson: "{}",
      isCurrent: true,
      gitCommitSha: null,
    },
  ]);
  return db;
}

describe("createAttestation", () => {
  it("inserts a row with a verification_token and published=false", async () => {
    const db = await seed();
    const result = await createAttestation(db, {
      orgName: "Acme Robotics",
      productName: "AcmeBot",
      productUrl: "https://acme.example",
      versionString: "1.0.0",
      contactEmail: "ada@acme.example",
    });
    expect(result.verificationToken).toMatch(/^[a-f0-9]{32}$/);
    const rows = await db.select().from(attestations);
    expect(rows).toHaveLength(1);
    expect(rows[0].published).toBe(false);
    expect(rows[0].needsManualReview).toBe(false);
    expect(rows[0].emailVerifiedAt).toBeNull();
  });

  it("flags needs_manual_review for frontier-lab org names", async () => {
    const db = await seed();
    await createAttestation(db, {
      orgName: "OpenAI",
      productName: "ChatGPT",
      productUrl: null,
      versionString: "1.0.0",
      contactEmail: "a@b.com",
    });
    const [row] = await db.select().from(attestations);
    expect(row.needsManualReview).toBe(true);
  });
});

describe("verifyAttestationToken", () => {
  it("publishes a non-flagged attestation on token confirmation", async () => {
    const db = await seed();
    const { verificationToken } = await createAttestation(db, {
      orgName: "Acme",
      productName: "Bot",
      productUrl: null,
      versionString: "1.0.0",
      contactEmail: "a@b.com",
    });
    const result = await verifyAttestationToken(db, verificationToken);
    expect(result.published).toBe(true);
    const [row] = await db.select().from(attestations);
    expect(row.published).toBe(true);
    expect(row.emailVerifiedAt).not.toBeNull();
  });

  it("does NOT publish a flagged attestation on token confirmation (admin must approve)", async () => {
    const db = await seed();
    const { verificationToken } = await createAttestation(db, {
      orgName: "OpenAI",
      productName: "GPT",
      productUrl: null,
      versionString: "1.0.0",
      contactEmail: "a@b.com",
    });
    const result = await verifyAttestationToken(db, verificationToken);
    expect(result.published).toBe(false);
    expect(result.needsManualReview).toBe(true);
    const [row] = await db.select().from(attestations);
    expect(row.emailVerifiedAt).not.toBeNull();
    expect(row.published).toBe(false);
  });

  it("throws on unknown token", async () => {
    const db = await seed();
    await expect(verifyAttestationToken(db, "deadbeef".repeat(4))).rejects.toThrow();
  });
});

describe("approveAttestation / hideAttestation", () => {
  it("approveAttestation publishes a flagged + email-verified row", async () => {
    const db = await seed();
    const { verificationToken } = await createAttestation(db, {
      orgName: "OpenAI",
      productName: "GPT",
      productUrl: null,
      versionString: "1.0.0",
      contactEmail: "a@b.com",
    });
    await verifyAttestationToken(db, verificationToken);
    const [row] = await db.select().from(attestations);
    await approveAttestation(db, row.id);
    const [after] = await db.select().from(attestations);
    expect(after.published).toBe(true);
    expect(after.manuallyApproved).toBe(true);
    expect(after.manuallyReviewedAt).not.toBeNull();
  });

  it("hideAttestation sets hidden_at on a published row", async () => {
    const db = await seed();
    const { verificationToken } = await createAttestation(db, {
      orgName: "Acme",
      productName: "Bot",
      productUrl: null,
      versionString: "1.0.0",
      contactEmail: "a@b.com",
    });
    await verifyAttestationToken(db, verificationToken);
    const [row] = await db.select().from(attestations);
    await hideAttestation(db, row.id, "false claim");
    const [after] = await db.select().from(attestations);
    expect(after.hiddenAt).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** (`module @/server/actions/attestations not found`)

- [ ] **Step 3: Write `src/server/actions/attestations.ts`**

```typescript
"use server";

import { eq } from "drizzle-orm";
import { attestations, versions } from "@/lib/db/schema";
import { needsManualReview } from "@/lib/attestations/allowlist";
import { generateVerificationToken } from "@/lib/attestations/token";

let _db: any | null = null;
function getDb() {
  if (!_db) _db = (require("@/lib/db") as { db: any }).db;
  return _db;
}

export interface CreateAttestationInput {
  orgName: string;
  productName: string;
  productUrl: string | null;
  versionString: string;
  contactEmail: string;
}

export async function createAttestation(
  dbClient: any = null,
  input: CreateAttestationInput,
): Promise<{
  id: string;
  verificationToken: string;
  needsManualReview: boolean;
}> {
  const db = dbClient ?? getDb();
  const v = await db
    .select()
    .from(versions)
    .where(eq(versions.version, input.versionString))
    .limit(1);
  if (v.length === 0) {
    throw new Error(`Unknown version: ${input.versionString}`);
  }
  const verificationToken = generateVerificationToken();
  const flagged = needsManualReview(input.orgName);
  const [row] = await db
    .insert(attestations)
    .values({
      orgName: input.orgName,
      productName: input.productName,
      productUrl: input.productUrl,
      versionId: v[0].id,
      contactEmail: input.contactEmail,
      verificationToken,
      needsManualReview: flagged,
    })
    .returning({ id: attestations.id });
  return {
    id: row.id,
    verificationToken,
    needsManualReview: flagged,
  };
}

export async function verifyAttestationToken(
  dbClient: any = null,
  token: string,
): Promise<{ id: string; published: boolean; needsManualReview: boolean }> {
  const db = dbClient ?? getDb();
  const rows = await db
    .select()
    .from(attestations)
    .where(eq(attestations.verificationToken, token))
    .limit(1);
  if (rows.length === 0) {
    throw new Error("Unknown verification token");
  }
  const row = rows[0];
  const shouldPublish = !row.needsManualReview;
  await db
    .update(attestations)
    .set({
      emailVerifiedAt: new Date(),
      published: shouldPublish,
    })
    .where(eq(attestations.id, row.id));
  return {
    id: row.id,
    published: shouldPublish,
    needsManualReview: row.needsManualReview,
  };
}

export async function approveAttestation(
  dbClient: any = null,
  attestationId: string,
): Promise<void> {
  const db = dbClient ?? getDb();
  await db
    .update(attestations)
    .set({
      manuallyReviewedAt: new Date(),
      manuallyApproved: true,
      published: true,
    })
    .where(eq(attestations.id, attestationId));
}

export async function hideAttestation(
  dbClient: any = null,
  attestationId: string,
  reason: string,
): Promise<void> {
  const db = dbClient ?? getDb();
  await db
    .update(attestations)
    .set({
      hiddenAt: new Date(),
      manuallyApproved: false,
      // reason is recorded in an admin log in a future task; for MVP it's a
      // parameter for telemetry / audit hooks but is not persisted.
    })
    .where(eq(attestations.id, attestationId));
}

/**
 * Server action wrapper for the public attestation form. Reads from FormData,
 * inserts the row, and sends the confirmation email. Returns the attestation
 * id so the page can show a "check your email" confirmation.
 */
export async function submitAttestationAction(formData: FormData): Promise<{
  ok: true;
  id: string;
  needsManualReview: boolean;
}> {
  const orgName = String(formData.get("orgName") ?? "").trim();
  const productName = String(formData.get("productName") ?? "").trim();
  const productUrl = (formData.get("productUrl")?.toString() ?? "").trim() || null;
  const versionString = String(formData.get("version") ?? "");
  const contactEmail = String(formData.get("contactEmail") ?? "").trim();
  if (orgName.length === 0 || productName.length === 0 || contactEmail.length === 0) {
    throw new Error("orgName, productName, and contactEmail are required");
  }
  const result = await createAttestation(null, {
    orgName,
    productName,
    productUrl,
    versionString,
    contactEmail,
  });
  // Best-effort email send
  try {
    const { attestationVerifyEmail } = await import("@/lib/email/templates");
    const { sendEmail } = await import("@/lib/email/send");
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const tpl = attestationVerifyEmail({
      orgName,
      productName,
      version: versionString,
      verifyUrl: `${siteUrl}/attestations/verify/${result.verificationToken}`,
    });
    await sendEmail({ to: contactEmail, ...tpl });
  } catch (err) {
    console.error("[email] attestation verify send failed:", err);
  }
  return { ok: true, id: result.id, needsManualReview: result.needsManualReview };
}
```

- [ ] **Step 4: Append to `src/lib/email/templates.ts`**

```typescript
export function attestationVerifyEmail(opts: {
  orgName: string;
  productName: string;
  version: string;
  verifyUrl: string;
}): { subject: string; text: string } {
  return {
    subject: `Confirm: ${opts.orgName}'s attestation for AI Bill of Rights v${opts.version}`,
    text: `Someone — hopefully you — submitted an attestation that ${opts.productName} (${opts.orgName}) was built referencing AI Bill of Rights v${opts.version}.

To confirm, click this link:
${opts.verifyUrl}

If you didn't submit this, just ignore the email and the attestation will not be published.

— The AI Bill of Rights project
`,
  };
}
```

- [ ] **Step 5: Run tests, expect PASS** (`pnpm test tests/server/attestations.test.ts`)

- [ ] **Step 6: Commit**

```bash
git add src/server/actions/attestations.ts src/lib/email/templates.ts tests/server/attestations.test.ts "prd/branch commit updates/feat/phase-2-as-code-attestations.md"
git commit -m "Add attestation server actions and confirmation email"
```

---

## Task 5: Query helpers for attestations

**Files:** `src/lib/db/queries.ts`, `tests/lib/db.queries.attestations.test.ts`

- [ ] **Step 1: Append to `src/lib/db/queries.ts`** (don't remove existing exports)

```typescript
import { and, isNull, isNotNull } from "drizzle-orm";
import { attestations } from "./schema";

export interface AttestationListItem {
  id: string;
  orgName: string;
  productName: string;
  productUrl: string | null;
  version: string;
  claimedAt: Date;
}

export async function listPublishedAttestations(
  db: any = null,
  opts: { limit: number; offset: number; versionString?: string },
): Promise<AttestationListItem[]> {
  const client = db ?? getDb();
  const conditions = [
    eq(attestations.published, true),
    isNull(attestations.hiddenAt),
  ];
  if (opts.versionString) {
    const v = await client
      .select({ id: versions.id })
      .from(versions)
      .where(eq(versions.version, opts.versionString))
      .limit(1);
    if (v.length === 0) return [];
    conditions.push(eq(attestations.versionId, v[0].id));
  }
  const rows = await client
    .select({
      id: attestations.id,
      orgName: attestations.orgName,
      productName: attestations.productName,
      productUrl: attestations.productUrl,
      version: versions.version,
      claimedAt: attestations.claimedAt,
    })
    .from(attestations)
    .innerJoin(versions, eq(versions.id, attestations.versionId))
    .where(and(...conditions))
    .orderBy(desc(attestations.claimedAt))
    .limit(opts.limit)
    .offset(opts.offset);
  return rows as AttestationListItem[];
}

export async function listPendingReviewAttestations(db: any = null) {
  const client = db ?? getDb();
  return client
    .select({
      id: attestations.id,
      orgName: attestations.orgName,
      productName: attestations.productName,
      productUrl: attestations.productUrl,
      contactEmail: attestations.contactEmail,
      claimedAt: attestations.claimedAt,
      emailVerifiedAt: attestations.emailVerifiedAt,
      version: versions.version,
    })
    .from(attestations)
    .innerJoin(versions, eq(versions.id, attestations.versionId))
    .where(
      and(
        eq(attestations.needsManualReview, true),
        isNotNull(attestations.emailVerifiedAt),
        isNull(attestations.manuallyReviewedAt),
        isNull(attestations.hiddenAt),
      ),
    )
    .orderBy(desc(attestations.claimedAt));
}
```

Make sure `versions` and `eq`, `desc` are imported at top of file (they already are from Plan 1; just add `and, isNull, isNotNull` and `attestations`).

- [ ] **Step 2: Write the test**

`tests/lib/db.queries.attestations.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { createTestDb } from "../_helpers/pglite-db";
import { syncVersions } from "@/lib/db/sync";
import {
  listPublishedAttestations,
  listPendingReviewAttestations,
} from "@/lib/db/queries";
import { createAttestation, verifyAttestationToken } from "@/server/actions/attestations";

const markdown = `---
version: 1.0.0
published_at: 2026-05-18
---

# T {#preamble}
x {#preamble-s-1}
`;

async function seed() {
  const db = await createTestDb();
  await syncVersions(db, [
    { version: "1.0.0", publishedAt: new Date(), markdown, agentsMd: "s", specJson: "{}", isCurrent: true, gitCommitSha: null },
  ]);
  return db;
}

describe("listPublishedAttestations", () => {
  it("returns only published, non-hidden attestations", async () => {
    const db = await seed();
    const a = await createAttestation(db, { orgName: "Acme", productName: "Bot", productUrl: null, versionString: "1.0.0", contactEmail: "x@y" });
    const b = await createAttestation(db, { orgName: "Beta", productName: "Bot2", productUrl: null, versionString: "1.0.0", contactEmail: "x@y" });
    await verifyAttestationToken(db, a.verificationToken);
    // b is unverified — should not appear
    const rows = await listPublishedAttestations(db, { limit: 10, offset: 0 });
    expect(rows.map((r) => r.orgName)).toEqual(["Acme"]);
  });

  it("filters by versionString", async () => {
    const db = await seed();
    const a = await createAttestation(db, { orgName: "Acme", productName: "Bot", productUrl: null, versionString: "1.0.0", contactEmail: "x@y" });
    await verifyAttestationToken(db, a.verificationToken);
    expect(await listPublishedAttestations(db, { limit: 10, offset: 0, versionString: "1.0.0" })).toHaveLength(1);
    expect(await listPublishedAttestations(db, { limit: 10, offset: 0, versionString: "9.9.9" })).toHaveLength(0);
  });
});

describe("listPendingReviewAttestations", () => {
  it("returns email-verified, flagged, not-yet-reviewed, not-hidden", async () => {
    const db = await seed();
    const openai = await createAttestation(db, { orgName: "OpenAI", productName: "GPT", productUrl: null, versionString: "1.0.0", contactEmail: "x@y" });
    // Email verified but admin hasn't reviewed yet
    await verifyAttestationToken(db, openai.verificationToken);
    const pending = await listPendingReviewAttestations(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].orgName).toBe("OpenAI");
  });
});
```

- [ ] **Step 3: Run tests, expect PASS** (`pnpm test`)

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries.ts tests/lib/db.queries.attestations.test.ts "prd/branch commit updates/feat/phase-2-as-code-attestations.md"
git commit -m "Add attestation query helpers"
```

---

## Task 6: Raw file routes — `/v/[version]/agents.md` and `/v/[version]/spec.json`

**Files:** `src/app/v/[version]/agents.md/route.ts`, `src/app/v/[version]/spec.json/route.ts`

Both need to serve the file contents from disk (the canonical source) with the right Content-Type. We could read from the cached `versions` row, but the raw markdown isn't stored there (only the `parsedJson`). Read from `content/bill-of-rights/` directly.

- [ ] **Step 1: `src/app/v/[version]/agents.md/route.ts`**

```typescript
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ version: string }> },
) {
  const { version } = await ctx.params;
  // Defend against path traversal: only allow versions matching the X.Y.Z pattern.
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return new Response("Not found", { status: 404 });
  }
  const filePath = path.join(
    process.cwd(),
    "content/bill-of-rights",
    `v${version}.agents.md`,
  );
  if (!fs.existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return new Response(content, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });
}
```

- [ ] **Step 2: `src/app/v/[version]/spec.json/route.ts`** (same pattern, content-type `application/json`)

```typescript
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ version: string }> },
) {
  const { version } = await ctx.params;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    return new Response("Not found", { status: 404 });
  }
  const filePath = path.join(
    process.cwd(),
    "content/bill-of-rights",
    `v${version}.spec.json`,
  );
  if (!fs.existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }
  const content = fs.readFileSync(filePath, "utf-8");
  return new Response(content, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });
}
```

- [ ] **Step 3: Smoke-test**

```bash
curl -i http://localhost:3000/v/1.0.0/agents.md | head -5
curl -i http://localhost:3000/v/1.0.0/spec.json | head -5
```

Expected: 200 + content-type header matching. (Dev server is already running from Phase 1; if not, `pnpm dev`.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/v/[version]/agents.md" "src/app/v/[version]/spec.json" "prd/branch commit updates/feat/phase-2-as-code-attestations.md"
git commit -m "Serve raw agents.md and spec.json per version"
```

---

## Task 7: As-Code page + components

**Files:** `src/app/v/[version]/as-code/page.tsx`, `src/components/AsCodeButton.tsx`, `src/components/AttestationForm.tsx`

The page has three sections:
1. **Code preview + copy/download** with tool tabs (Claude Code / Cursor / Copilot / Generic — each one is just a different suggested filename)
2. **`curl` one-liner** for grabbing the file
3. **Attestation form** (org name, product name, product URL, email)

Keep the tabs as plain anchor links — `?tool=cursor` etc. — so the page stays server-rendered (no client component needed for tab selection).

- [ ] **Step 1: `src/components/AsCodeButton.tsx`**

```typescript
import Link from "next/link";

interface Props {
  version: string;
}

export function AsCodeButton({ version }: Props) {
  return (
    <Link
      href={`/v/${version}/as-code`}
      className="inline-flex items-center justify-center rounded-full border border-zinc-300 px-6 py-3 text-base font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
    >
      Implement as code →
    </Link>
  );
}
```

- [ ] **Step 2: `src/components/AttestationForm.tsx`**

```typescript
import { submitAttestationAction } from "@/server/actions/attestations";

interface Props {
  version: string;
}

export function AttestationForm({ version }: Props) {
  return (
    <form
      action={submitAttestationAction}
      className="mt-6 flex flex-col gap-4 rounded-lg border border-zinc-200 p-6 dark:border-zinc-800"
    >
      <h3 className="text-lg font-semibold">Public attestation</h3>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Publicly commit that your product was built referencing this version.
        We'll send a confirmation link to your email; your attestation appears
        on{" "}
        <a href="/attestations" className="underline">
          /attestations
        </a>{" "}
        once confirmed.
      </p>
      <input type="hidden" name="version" value={version} />
      <label className="flex flex-col gap-1 text-sm">
        Organization name (required)
        <input
          name="orgName"
          type="text"
          required
          maxLength={200}
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Product name (required)
        <input
          name="productName"
          type="text"
          required
          maxLength={200}
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Product URL (optional)
        <input
          name="productUrl"
          type="url"
          maxLength={500}
          placeholder="https://"
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Contact email (required)
        <input
          name="contactEmail"
          type="email"
          required
          maxLength={200}
          className="rounded-md border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
      <button
        type="submit"
        className="self-start rounded-full bg-zinc-900 px-6 py-3 text-base font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-950"
      >
        Submit attestation
      </button>
    </form>
  );
}
```

- [ ] **Step 3: `src/app/v/[version]/as-code/page.tsx`**

```typescript
import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { AttestationForm } from "@/components/AttestationForm";

export const dynamic = "force-dynamic";

const TOOL_FILENAMES: Record<string, string> = {
  "claude-code": "CLAUDE.md",
  cursor: ".cursorrules",
  copilot: ".github/copilot-instructions.md",
  generic: "AGENTS.md",
};

const TOOL_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  cursor: "Cursor",
  copilot: "Copilot",
  generic: "Generic",
};

export default async function AsCodePage({
  params,
  searchParams,
}: {
  params: Promise<{ version: string }>;
  searchParams: Promise<{ tool?: string }>;
}) {
  const { version } = await params;
  const { tool = "generic" } = await searchParams;
  const toolKey = TOOL_FILENAMES[tool] ? tool : "generic";
  const saveAsName = TOOL_FILENAMES[toolKey];

  if (!/^\d+\.\d+\.\d+$/.test(version)) notFound();
  const agentsPath = path.join(
    process.cwd(),
    "content/bill-of-rights",
    `v${version}.agents.md`,
  );
  if (!fs.existsSync(agentsPath)) notFound();
  const agentsContent = fs.readFileSync(agentsPath, "utf-8");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const curlCmd = `curl -fsSL ${siteUrl}/v/${version}/agents.md > ${saveAsName}`;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <p className="text-xs uppercase tracking-widest text-zinc-500">
        Building AI? Make it public.
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">
        Implement AI Bill of Rights v{version} in your code
      </h1>
      <p className="mt-4 text-zinc-700 dark:text-zinc-300">
        Drop this file into your AI-assistant project as a binding instruction
        set. Then publicly attest that your product adheres to this version.
      </p>

      <h2 className="mt-10 text-xl font-semibold">1. Get the file</h2>
      <nav className="mt-4 flex flex-wrap gap-2 text-sm">
        {Object.keys(TOOL_FILENAMES).map((key) => {
          const active = key === toolKey;
          return (
            <a
              key={key}
              href={`/v/${version}/as-code?tool=${key}`}
              className={
                active
                  ? "rounded-full bg-zinc-900 px-4 py-1 font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
                  : "rounded-full border border-zinc-300 px-4 py-1 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }
            >
              {TOOL_LABELS[key]}
            </a>
          );
        })}
      </nav>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
        Save the file as{" "}
        <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs dark:bg-zinc-800">
          {saveAsName}
        </code>{" "}
        in your project root.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <a
          href={`/v/${version}/agents.md`}
          download={saveAsName}
          className="rounded-full bg-zinc-900 px-5 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
        >
          Download {saveAsName}
        </a>
        <a
          href={`/v/${version}/spec.json`}
          download={`bill-of-rights-v${version}.spec.json`}
          className="rounded-full border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Download spec.json
        </a>
      </div>

      <h3 className="mt-6 text-sm font-semibold">curl one-liner</h3>
      <pre className="mt-2 overflow-auto rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
        <code>{curlCmd}</code>
      </pre>

      <h3 className="mt-6 text-sm font-semibold">Preview</h3>
      <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-zinc-100 p-3 text-xs dark:bg-zinc-900">
        <code>{agentsContent}</code>
      </pre>

      <h2 className="mt-12 text-xl font-semibold">2. Attest publicly</h2>
      <AttestationForm version={version} />
    </main>
  );
}
```

- [ ] **Step 4: Modify `src/app/v/[version]/page.tsx`** — add the AsCodeButton next to the SignButton in the sticky bottom CTA:

Replace the existing sticky div with:

```typescript
      <div className="sticky bottom-6 mt-12 flex flex-wrap justify-center gap-3">
        <SignButton version={row.version} />
        <AsCodeButton version={row.version} />
      </div>
```

…and add `import { AsCodeButton } from "@/components/AsCodeButton";` at top.

- [ ] **Step 5: Modify `src/app/page.tsx`** — add a secondary CTA below the existing two. Insert this immediately after the `Why this matters` link, inside the same flex container:

```typescript
        <Link
          href={`/v/${versionString}/as-code`}
          className="text-base font-medium text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
        >
          Building AI? Implement this in your code →
        </Link>
```

- [ ] **Step 6: Smoke test**

Visit `http://localhost:3000/v/1.0.0/as-code`. Confirm: tabs work (`?tool=cursor` changes the suggested filename); curl line renders with the right URL; download buttons work; attestation form renders.

- [ ] **Step 7: Commit**

```bash
git add "src/app/v/[version]/as-code" src/components/AsCodeButton.tsx src/components/AttestationForm.tsx "src/app/v/[version]/page.tsx" src/app/page.tsx "prd/branch commit updates/feat/phase-2-as-code-attestations.md"
git commit -m "Add /v/[version]/as-code page and surface from landing + version page"
```

---

## Task 8: Public `/attestations` page + AttestationCard

**Files:** `src/components/AttestationCard.tsx`, `src/app/attestations/page.tsx`

- [ ] **Step 1: `src/components/AttestationCard.tsx`**

```typescript
import type { AttestationListItem } from "@/lib/db/queries";

interface Props {
  item: AttestationListItem;
}

export function AttestationCard({ item }: Props) {
  return (
    <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-base font-semibold text-zinc-950 dark:text-zinc-50">
          {item.productName}
        </span>
        <span className="text-sm text-zinc-500">by {item.orgName}</span>
      </div>
      {item.productUrl ? (
        <div className="mt-1 text-sm">
          <a
            href={item.productUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-700 underline-offset-4 hover:underline dark:text-zinc-300"
          >
            {item.productUrl}
          </a>
        </div>
      ) : null}
      <div className="mt-2 text-xs text-zinc-500">
        Attested to v{item.version} on {item.claimedAt.toISOString().slice(0, 10)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `src/app/attestations/page.tsx`**

```typescript
import { listPublishedAttestations } from "@/lib/db/queries";
import { AttestationCard } from "@/components/AttestationCard";

export const dynamic = "force-dynamic";

export default async function AttestationsPage({
  searchParams,
}: {
  searchParams: Promise<{ version?: string; page?: string }>;
}) {
  const { version, page = "1" } = await searchParams;
  const pageNum = Math.max(1, Number(page) || 1);
  const limit = 50;
  const rows = await listPublishedAttestations(undefined, {
    limit,
    offset: (pageNum - 1) * limit,
    versionString: version,
  });

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Attestations</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        AI products whose builders publicly committed to a version of the Bill
        of Rights{version ? ` (filtered: v${version})` : ""}.
      </p>
      <div className="mt-8 flex flex-col gap-3">
        {rows.length === 0 ? (
          <p className="text-zinc-500">No attestations yet.</p>
        ) : (
          rows.map((item) => <AttestationCard key={item.id} item={item} />)
        )}
      </div>
      {rows.length === limit ? (
        <div className="mt-8 flex justify-center">
          <a
            href={`/attestations?page=${pageNum + 1}${version ? `&version=${encodeURIComponent(version)}` : ""}`}
            className="rounded-full border border-zinc-300 px-6 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900"
          >
            Next page →
          </a>
        </div>
      ) : null}
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/AttestationCard.tsx src/app/attestations/page.tsx "prd/branch commit updates/feat/phase-2-as-code-attestations.md"
git commit -m "Add public /attestations page"
```

---

## Task 9: Email-confirmation landing page

**Files:** `src/app/attestations/verify/[token]/page.tsx`

- [ ] **Step 1:**

```typescript
import { verifyAttestationToken } from "@/server/actions/attestations";

export const dynamic = "force-dynamic";

export default async function VerifyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  let outcome: "published" | "review" | "error" = "error";
  let errorMessage = "";
  try {
    const result = await verifyAttestationToken(null, token);
    outcome = result.published ? "published" : "review";
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Unknown error";
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-24 text-center">
      {outcome === "published" ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">Confirmed.</h1>
          <p className="mt-4 text-zinc-700 dark:text-zinc-300">
            Your attestation is now public. Thanks for committing.
          </p>
          <a
            href="/attestations"
            className="mt-8 inline-block rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
          >
            See all attestations
          </a>
        </>
      ) : outcome === "review" ? (
        <>
          <h1 className="text-3xl font-semibold tracking-tight">Confirmed — pending review.</h1>
          <p className="mt-4 text-zinc-700 dark:text-zinc-300">
            Your email is confirmed. Because your organization name matches a
            high-profile AI lab, we'll review the attestation manually before
            publishing it. We'll email you when it goes live (or if we have a
            question).
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-semibold tracking-tight text-red-700">
            Link not valid
          </h1>
          <p className="mt-4 text-zinc-700 dark:text-zinc-300">
            {errorMessage || "This verification link is unknown or expired."}
          </p>
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/attestations/verify "prd/branch commit updates/feat/phase-2-as-code-attestations.md"
git commit -m "Add attestation email-verification landing page"
```

---

## Task 10: Admin review queue

**Files:** `src/app/admin/attestations/page.tsx`

Admin pages are Clerk-gated by the `signers.is_admin` boolean. The middleware (`src/proxy.ts`) already protects `/admin/*` to require auth; the page itself checks `is_admin`.

- [ ] **Step 1: Add admin matcher to `src/proxy.ts`** (if not already)

Open `src/proxy.ts` and ensure `/admin(.*)` is in the protected matcher list:

```typescript
const isProtectedRoute = createRouteMatcher([
  "/sign/profile(.*)",
  "/sign/consent(.*)",
  "/sign/complete(.*)",
  "/account(.*)",
  "/admin(.*)",
]);
```

If `/admin(.*)` is already there, no change.

- [ ] **Step 2: Write the page**

`src/app/admin/attestations/page.tsx`:

```typescript
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { signers } from "@/lib/db/schema";
import { listPendingReviewAttestations } from "@/lib/db/queries";
import {
  approveAttestation,
  hideAttestation,
} from "@/server/actions/attestations";

export const dynamic = "force-dynamic";

async function approveFormAction(formData: FormData): Promise<void> {
  "use server";
  const { userId } = await auth();
  if (!userId) redirect("/");
  const adminCheck = await db
    .select({ isAdmin: signers.isAdmin })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (!adminCheck[0]?.isAdmin) {
    throw new Error("Not authorized");
  }
  const id = String(formData.get("id"));
  await approveAttestation(null, id);
  redirect("/admin/attestations");
}

async function hideFormAction(formData: FormData): Promise<void> {
  "use server";
  const { userId } = await auth();
  if (!userId) redirect("/");
  const adminCheck = await db
    .select({ isAdmin: signers.isAdmin })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (!adminCheck[0]?.isAdmin) {
    throw new Error("Not authorized");
  }
  const id = String(formData.get("id"));
  const reason = String(formData.get("reason") ?? "false claim");
  await hideAttestation(null, id, reason);
  redirect("/admin/attestations");
}

export default async function AdminAttestationsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");
  const adminCheck = await db
    .select({ isAdmin: signers.isAdmin })
    .from(signers)
    .where(eq(signers.clerkUserId, userId))
    .limit(1);
  if (!adminCheck[0]?.isAdmin) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Not authorized</h1>
        <p className="mt-3 text-sm text-zinc-600">
          This page is restricted to project administrators.
        </p>
      </main>
    );
  }

  const pending = await listPendingReviewAttestations();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Admin · Attestation Review</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Email-verified attestations claiming a high-profile org name. Approve to publish, or hide if false.
      </p>
      <div className="mt-8 flex flex-col gap-4">
        {pending.length === 0 ? (
          <p className="text-zinc-500">Nothing in the review queue.</p>
        ) : (
          pending.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30"
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-lg font-semibold">{item.orgName}</span>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  · {item.productName}
                </span>
              </div>
              <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Version: v{item.version} · Contact: {item.contactEmail}
              </div>
              {item.productUrl ? (
                <div className="mt-1 text-xs">
                  <a
                    href={item.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {item.productUrl}
                  </a>
                </div>
              ) : null}
              <div className="mt-1 text-xs text-zinc-500">
                Claimed: {item.claimedAt.toISOString().slice(0, 10)}
                {item.emailVerifiedAt
                  ? ` · Email verified: ${new Date(item.emailVerifiedAt).toISOString().slice(0, 10)}`
                  : ""}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <form action={approveFormAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <button
                    type="submit"
                    className="rounded-full bg-emerald-700 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-600"
                  >
                    Approve & publish
                  </button>
                </form>
                <form action={hideFormAction}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="reason" value="false claim" />
                  <button
                    type="submit"
                    className="rounded-full bg-red-700 px-5 py-2 text-sm font-medium text-white hover:bg-red-600"
                  >
                    Hide (false claim)
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

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/attestations src/proxy.ts "prd/branch commit updates/feat/phase-2-as-code-attestations.md"
git commit -m "Add admin attestation review queue (Clerk + is_admin gated)"
```

---

## Task 11: README touchups + final smoke

**Files:** `README.md`

- [ ] **Step 1: Append a section to `README.md`** (after "Publishing a new version"):

```markdown
## "Implement as Code" surface for AI builders

Every version of the Bill of Rights ships with three files:

- `v{X.Y.Z}.md` — human-readable document
- `v{X.Y.Z}.agents.md` — LLM/coding-agent instruction file (drop into your project as `CLAUDE.md`, `.cursorrules`, `AGENTS.md`, etc.)
- `v{X.Y.Z}.spec.json` — machine-readable per-principle spec

Builders can grab these directly:

```bash
curl -fsSL https://aibillofrights.org/v/1.0.0/agents.md > AGENTS.md
```

…or visit `/v/[version]/as-code` for tool-specific tabs, download buttons, and the public attestation form. Public attestations appear at `/attestations`; claims naming frontier AI labs queue for admin review at `/admin/attestations` before going live.
```

- [ ] **Step 2: Smoke test**

```bash
pnpm test           # all tests green
pnpm exec tsc --noEmit --skipLibCheck   # clean
```

Then in a browser:
- `/v/1.0.0/as-code` — tabs + downloads + form
- Submit a test attestation; check email is no-op'd in console (no real Resend in dev unless `RESEND_API_KEY` set)
- `/attestations/verify/<token-from-DB>` — manually grab a token via `psql` or the Neon console to test the verify path
- `/attestations` — see the verified attestation

- [ ] **Step 3: Commit**

```bash
git add README.md "prd/branch commit updates/feat/phase-2-as-code-attestations.md"
git commit -m "Document the implement-as-code and attestations surfaces"
```

---

## Self-Review

**Spec coverage (Section 9 of design spec):**
- `agents.md` + `spec.json` per version → Tasks 6, 7 ✓
- `/v/[version]/as-code` page with tool tabs + curl + downloads → Task 7 ✓
- `attestations` table + email-token verification → Tasks 1, 2, 4 ✓
- Allowlist-gated manual review for frontier labs → Task 3, 4, 10 ✓
- Public `/attestations` page → Task 8 ✓
- Admin review queue `/admin/attestations` → Task 10 ✓
- Landing-page secondary CTA + version-page button → Task 7 ✓

**Placeholder scan:** All code blocks are complete; no `TODO` markers; allowlist contains real names; email template is real.

**Type consistency:** `AttestationListItem` defined in queries.ts, consumed in components. `verificationToken` (camelCase JS) ↔ `verification_token` (snake_case SQL) consistent.

**Risk note:** The `hideAttestation` action accepts a `reason` parameter but doesn't persist it. For MVP this is fine — the action is admin-only, audit-via-git-log is sufficient. A future task can add an `attestation_hide_log` table if real audit trail is needed.
