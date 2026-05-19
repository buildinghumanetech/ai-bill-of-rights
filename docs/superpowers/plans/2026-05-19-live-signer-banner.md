# Live Signer Banner — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a polling-based "live signer banner" — a floating pill near the top of the viewport that flashes briefly when someone signs the Bill of Rights, with a click-through to that signer's public page and a live-incrementing signature count.

**Architecture:** One new API route (`GET /api/signers/recent`) returning `{ count, newSigners }`. One client provider mounted in the root layout owns 60-second polling + a FIFO event queue, exposing both `count` and the currently-showing event via React context. A small banner component animates each event in/out for ~5.5s, with a click handler routing to `/signatories/[id]`. A trivial `<SignatureCount />` consumer replaces every server-rendered `{signatureCount.toLocaleString()}` usage so all count displays update in lockstep. Pure queue/state logic lives in a separate reducer file so it's unit-testable in isolation.

**Tech Stack:** Next.js 16.2.6 App Router · React 19.2 · TypeScript · Tailwind 4 · Drizzle ORM (existing) · Neon Postgres (existing) · Vitest with `@electric-sql/pglite` for in-memory DB tests (existing pattern).

**Reference:** This plan implements `docs/superpowers/specs/2026-05-19-live-signer-banner-design.md`.

**A note on Next.js 16:** Before writing the route handler (Task 2) or modifying the root layout (Task 7), read the relevant docs in `node_modules/next/dist/docs/01-app/`. The App Router route-handler API and the `request.nextUrl.searchParams` shape have shifted between recent versions and your training data may be stale.

---

## File structure (created or modified by this plan)

```
/                                                       # repo root
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── signers/
│   │   │       └── recent/
│   │   │           └── route.ts                        # Task 2 (NEW)
│   │   ├── layout.tsx                                  # Task 7 (MODIFY)
│   │   ├── page.tsx                                    # Task 8 (MODIFY)
│   │   ├── FloatingSignButton.tsx                      # Task 8 (MODIFY)
│   │   ├── live-signers-reducer.ts                     # Task 3 (NEW — pure)
│   │   ├── LiveSignersProvider.tsx                     # Task 4 (NEW — "use client")
│   │   ├── SignatureCount.tsx                          # Task 5 (NEW — "use client")
│   │   └── LiveSignerBanner.tsx                        # Task 6 (NEW — "use client")
│   └── lib/
│       └── db/
│           └── queries.ts                              # Task 1 (MODIFY — add listRecentSignersSince)
│
└── tests/
    ├── lib/
    │   └── db.queries.test.ts                          # Task 1 (MODIFY — add tests)
    ├── app/
    │   ├── live-signers-reducer.test.ts                # Task 3 (NEW)
    │   └── api/
    │       └── signers.recent.test.ts                  # Task 2 (NEW)
```

---

## Task 0: Orientation (no commit)

**Files:** none.

- [ ] **Step 1: Read the relevant Next.js 16 docs**

The route handler in Task 2 uses `NextRequest.nextUrl.searchParams` and a named `GET` export. Confirm shape and signature by reading:

```
node_modules/next/dist/docs/01-app/02-api-reference/02-file-conventions/route.md
node_modules/next/dist/docs/01-app/02-api-reference/02-file-conventions/route-segment-config.md
```

Layout changes in Task 7 make `RootLayout` an async server component. Confirm async-layout support and any new constraints by skimming:

```
node_modules/next/dist/docs/01-app/02-api-reference/02-file-conventions/layout.md
```

- [ ] **Step 2: Skim the existing spec and pattern files** so the rest of the plan reads in context

Read:
- `docs/superpowers/specs/2026-05-19-live-signer-banner-design.md` — the spec this plan implements.
- `src/lib/db/queries.ts` — the existing `listSignatures` is the closest analogue; new function should match its shape (lazy `getDefaultDb()`, optional `db` arg first).
- `tests/lib/db.queries.test.ts` — the test pattern (uses `createTestDb()` from `tests/_helpers/pglite-db.ts`).
- `tests/_helpers/pglite-db.ts` — note that `softBannedAt` is not in the test schema. You'll add it in Task 1 alongside the function.

---

## Task 1: DB query — `listRecentSignersSince`

**Files:**
- Modify: `src/lib/db/queries.ts`
- Modify: `tests/_helpers/pglite-db.ts` (add `soft_banned_at` column to the test schema if missing)
- Test: `tests/lib/db.queries.test.ts`

- [ ] **Step 1: Verify test schema has `soft_banned_at`**

Open `tests/_helpers/pglite-db.ts` and check the `create table signers` block. If `soft_banned_at timestamptz` is **not** there, add it. The Drizzle schema in `src/lib/db/schema.ts` already declares it (`signers.softBannedAt`), so the test DDL must match. The column should appear right after `is_admin boolean not null default false`:

```sql
create table signers (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null unique,
  display_name text not null,
  affiliation text,
  location_text text,
  verification_method text not null check (verification_method in ('email','sms')),
  verified_at timestamptz not null,
  is_admin boolean not null default false,
  soft_banned_at timestamptz,
  notification_preference text not null default 'major'
    check (notification_preference in ('major','minor','none')),
  created_at timestamptz not null default now()
);
```

If `notification_preference` is also missing, add it (it's in the Drizzle schema). The test DDL drifts from the real schema occasionally — both columns are required for the soft-banned exclusion test in Step 2 and for any existing tests that insert defaults.

- [ ] **Step 2: Write the failing tests**

Append to `tests/lib/db.queries.test.ts`:

```ts
import { listRecentSignersSince } from "@/lib/db/queries";

describe("listRecentSignersSince", () => {
  async function seedSigner(
    db: any,
    {
      name,
      signedAt,
      softBanned = false,
    }: { name: string; signedAt: Date; softBanned?: boolean },
  ) {
    const [signer] = await db
      .insert(signers)
      .values({
        clerkUserId: `u-${name}`,
        displayName: name,
        affiliation: null,
        locationText: "Somewhere, US",
        verificationMethod: "email" as const,
        verifiedAt: new Date("2026-01-01T00:00:00Z"),
        softBannedAt: softBanned ? new Date() : null,
      })
      .returning({ id: signers.id });
    const [record] = await db
      .insert(consentRecords)
      .values({
        signerId: signer.id,
        consentTextHash: "a".repeat(64),
        capturedFields: {} as any,
      })
      .returning({ id: consentRecords.id });
    const [versionRow] = await db.select().from(versions).limit(1);
    await db.insert(signatures).values({
      signerId: signer.id,
      versionId: versionRow.id,
      versionHashAtSigning: versionRow.markdownHash,
      consentRecordId: record.id,
      signedAt,
    });
    return signer.id;
  }

  it("with since=null returns only signers from the past 60 minutes", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", true)]);
    const now = Date.now();
    await seedSigner(db, { name: "Old", signedAt: new Date(now - 90 * 60 * 1000) });
    await seedSigner(db, { name: "Recent", signedAt: new Date(now - 30 * 60 * 1000) });
    await seedSigner(db, { name: "JustNow", signedAt: new Date(now - 60 * 1000) });

    const rows = await listRecentSignersSince(null, db);
    expect(rows.map((r) => r.displayName).sort()).toEqual(["JustNow", "Recent"]);
  });

  it("with since=<timestamp> returns only signers signed strictly after it", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", true)]);
    const t0 = new Date("2026-05-19T20:00:00Z");
    await seedSigner(db, { name: "Before", signedAt: new Date(t0.getTime() - 60_000) });
    await seedSigner(db, { name: "Exactly", signedAt: t0 });
    await seedSigner(db, { name: "After", signedAt: new Date(t0.getTime() + 60_000) });

    const rows = await listRecentSignersSince(t0, db);
    expect(rows.map((r) => r.displayName)).toEqual(["After"]);
  });

  it("excludes soft-banned signers", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", true)]);
    const recent = new Date(Date.now() - 5 * 60 * 1000);
    await seedSigner(db, { name: "Visible", signedAt: recent });
    await seedSigner(db, { name: "Banned", signedAt: recent, softBanned: true });

    const rows = await listRecentSignersSince(null, db);
    expect(rows.map((r) => r.displayName)).toEqual(["Visible"]);
  });

  it("returns rows ordered by signed_at desc (newest first)", async () => {
    const db = await createTestDb();
    await syncVersions(db, [sample("1.0.0", true)]);
    const now = Date.now();
    await seedSigner(db, { name: "Oldest", signedAt: new Date(now - 50 * 60 * 1000) });
    await seedSigner(db, { name: "Middle", signedAt: new Date(now - 30 * 60 * 1000) });
    await seedSigner(db, { name: "Newest", signedAt: new Date(now - 5 * 60 * 1000) });

    const rows = await listRecentSignersSince(null, db);
    expect(rows.map((r) => r.displayName)).toEqual(["Newest", "Middle", "Oldest"]);
  });
});
```

- [ ] **Step 3: Run tests to confirm they fail**

```
pnpm test -- tests/lib/db.queries.test.ts
```

Expected: `listRecentSignersSince` tests fail because the function doesn't exist yet.

- [ ] **Step 4: Implement `listRecentSignersSince`**

Open `src/lib/db/queries.ts`. Add the import of `gt`, `and`, `isNull` from `drizzle-orm`, and append the function below `listSignatures`:

```ts
import { eq, count, desc, gt, and, isNull } from "drizzle-orm";
// ...existing imports...

export interface RecentSignerEvent {
  id: string;
  displayName: string;
  locationText: string | null;
  signedAt: Date;
}

const SIXTY_MINUTES_MS = 60 * 60 * 1000;

export async function listRecentSignersSince(
  since: Date | null,
  db: any = null,
): Promise<RecentSignerEvent[]> {
  const client = db ?? getDefaultDb();
  const cutoff = since ?? new Date(Date.now() - SIXTY_MINUTES_MS);
  const rows = await client
    .select({
      id: signers.id,
      displayName: signers.displayName,
      locationText: signers.locationText,
      signedAt: signatures.signedAt,
    })
    .from(signatures)
    .innerJoin(signers, eq(signers.id, signatures.signerId))
    .where(and(gt(signatures.signedAt, cutoff), isNull(signers.softBannedAt)))
    .orderBy(desc(signatures.signedAt));
  return rows as RecentSignerEvent[];
}
```

- [ ] **Step 5: Run tests to confirm pass**

```
pnpm test -- tests/lib/db.queries.test.ts
```

Expected: all four new tests pass. Existing tests in the file also still pass.

- [ ] **Step 6: Commit**

```
git add src/lib/db/queries.ts tests/lib/db.queries.test.ts tests/_helpers/pglite-db.ts
git commit -m "Add listRecentSignersSince DB query"
```

---

## Task 2: API route — `GET /api/signers/recent`

**Files:**
- Create: `src/app/api/signers/recent/route.ts`
- Test: `tests/app/api/signers.recent.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/app/api/signers.recent.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/queries", () => ({
  getSignatureCount: vi.fn(),
  listRecentSignersSince: vi.fn(),
}));

import { GET } from "@/app/api/signers/recent/route";
import { getSignatureCount, listRecentSignersSince } from "@/lib/db/queries";

describe("GET /api/signers/recent", () => {
  beforeEach(() => {
    vi.mocked(getSignatureCount).mockReset();
    vi.mocked(listRecentSignersSince).mockReset();
  });

  it("returns { count, newSigners } shape with no since param (cold-start)", async () => {
    vi.mocked(getSignatureCount).mockResolvedValue(7);
    vi.mocked(listRecentSignersSince).mockResolvedValue([
      {
        id: "abc",
        displayName: "Alice",
        locationText: "NYC, US",
        signedAt: new Date("2026-05-19T20:00:00Z"),
      },
    ]);

    const req = new NextRequest("http://localhost/api/signers/recent");
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body.count).toBe(7);
    expect(body.newSigners).toHaveLength(1);
    expect(body.newSigners[0]).toEqual({
      id: "abc",
      displayName: "Alice",
      locationText: "NYC, US",
      signedAt: "2026-05-19T20:00:00.000Z",
    });
    expect(vi.mocked(listRecentSignersSince).mock.calls[0][0]).toBeNull();
  });

  it("passes the since cursor through to listRecentSignersSince", async () => {
    vi.mocked(getSignatureCount).mockResolvedValue(7);
    vi.mocked(listRecentSignersSince).mockResolvedValue([]);

    const since = "2026-05-19T20:30:00.000Z";
    const req = new NextRequest(
      `http://localhost/api/signers/recent?since=${encodeURIComponent(since)}`,
    );
    await GET(req);

    const arg = vi.mocked(listRecentSignersSince).mock.calls[0][0];
    expect(arg).toBeInstanceOf(Date);
    expect(arg!.toISOString()).toBe(since);
  });

  it("returns 400 when since is not a valid ISO timestamp", async () => {
    const req = new NextRequest(
      "http://localhost/api/signers/recent?since=not-a-date",
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 500 on DB error without leaking internals", async () => {
    vi.mocked(getSignatureCount).mockRejectedValue(
      new Error("DATABASE_URL not set; credentials redacted=abc123"),
    );
    vi.mocked(listRecentSignersSince).mockResolvedValue([]);

    const req = new NextRequest("http://localhost/api/signers/recent");
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    expect(JSON.stringify(body)).not.toContain("DATABASE_URL");
    expect(JSON.stringify(body)).not.toContain("abc123");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pnpm test -- tests/app/api/signers.recent.test.ts
```

Expected: all four tests fail with "Cannot find module '@/app/api/signers/recent/route'" or equivalent.

- [ ] **Step 3: Implement the route handler**

Create `src/app/api/signers/recent/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { getSignatureCount, listRecentSignersSince } from "@/lib/db/queries";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const sinceParam = request.nextUrl.searchParams.get("since");
  let since: Date | null = null;
  if (sinceParam !== null) {
    const parsed = new Date(sinceParam);
    if (isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Invalid 'since' parameter; expected ISO-8601 timestamp" },
        { status: 400 },
      );
    }
    since = parsed;
  }

  try {
    const [count, newSigners] = await Promise.all([
      getSignatureCount(),
      listRecentSignersSince(since),
    ]);
    return NextResponse.json(
      { count, newSigners },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[api/signers/recent] failed:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 4: Run tests to confirm pass**

```
pnpm test -- tests/app/api/signers.recent.test.ts
```

Expected: all four tests pass.

- [ ] **Step 5: Commit**

```
git add src/app/api/signers/recent/route.ts tests/app/api/signers.recent.test.ts
git commit -m "Add GET /api/signers/recent route handler"
```

---

## Task 3: Pure queue/state reducer

**Files:**
- Create: `src/app/live-signers-reducer.ts`
- Test: `tests/app/live-signers-reducer.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/app/live-signers-reducer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  liveSignersReducer,
  initialLiveSignersState,
  QUEUE_CAP,
  type LiveSignerEvent,
  type LiveSignersState,
} from "@/app/live-signers-reducer";

const ev = (id: string, signedAt: string): LiveSignerEvent => ({
  id,
  displayName: `User ${id}`,
  locationText: "Somewhere, US",
  signedAt,
});

describe("liveSignersReducer", () => {
  const start = initialLiveSignersState(7);

  it("initial state seeds count from prop, empties queue and currentEvent", () => {
    expect(start).toEqual({
      count: 7,
      queue: [],
      currentEvent: null,
      latestSignedAt: null,
    });
  });

  describe("poll-response cold-start", () => {
    it("with no new signers, updates count and leaves queue/currentEvent untouched", () => {
      const next = liveSignersReducer(start, {
        type: "poll-response",
        isColdStart: true,
        count: 9,
        newSigners: [],
      });
      expect(next.count).toBe(9);
      expect(next.queue).toEqual([]);
      expect(next.currentEvent).toBeNull();
      expect(next.latestSignedAt).toBeNull();
    });

    it("with several new signers, only the most recent becomes currentEvent; rest folded silently into count", () => {
      const newSigners = [
        ev("c", "2026-05-19T20:30:00Z"),
        ev("b", "2026-05-19T20:15:00Z"),
        ev("a", "2026-05-19T20:00:00Z"),
      ];
      const next = liveSignersReducer(start, {
        type: "poll-response",
        isColdStart: true,
        count: 10,
        newSigners,
      });
      expect(next.count).toBe(10);
      expect(next.currentEvent?.id).toBe("c");
      expect(next.queue).toEqual([]);
      expect(next.latestSignedAt).toBe("2026-05-19T20:30:00Z");
    });
  });

  describe("poll-response regular", () => {
    it("with several new signers, reverses to oldest-first, drains first to currentEvent, queues rest", () => {
      const newSigners = [
        ev("c", "2026-05-19T20:30:00Z"),
        ev("b", "2026-05-19T20:15:00Z"),
        ev("a", "2026-05-19T20:00:00Z"),
      ];
      const next = liveSignersReducer(start, {
        type: "poll-response",
        isColdStart: false,
        count: 10,
        newSigners,
      });
      expect(next.currentEvent?.id).toBe("a"); // oldest first
      expect(next.queue.map((e) => e.id)).toEqual(["b", "c"]);
      expect(next.latestSignedAt).toBe("2026-05-19T20:30:00Z");
    });

    it("does not displace a currentEvent that's still showing; appends to queue", () => {
      const stateWithCurrent: LiveSignersState = {
        ...start,
        currentEvent: ev("showing", "2026-05-19T19:55:00Z"),
      };
      const next = liveSignersReducer(stateWithCurrent, {
        type: "poll-response",
        isColdStart: false,
        count: 8,
        newSigners: [ev("a", "2026-05-19T20:00:00Z")],
      });
      expect(next.currentEvent?.id).toBe("showing");
      expect(next.queue.map((e) => e.id)).toEqual(["a"]);
    });

    it("respects QUEUE_CAP (cap at 5)", () => {
      const newSigners = Array.from({ length: 10 }, (_, i) =>
        ev(`s${i}`, `2026-05-19T20:${String(i).padStart(2, "0")}:00Z`),
      ).reverse(); // server returns newest-first
      const next = liveSignersReducer(start, {
        type: "poll-response",
        isColdStart: false,
        count: 100,
        newSigners,
      });
      // First drains to currentEvent; remaining queue length is at most QUEUE_CAP
      expect(next.queue.length).toBeLessThanOrEqual(QUEUE_CAP);
    });
  });

  describe("event-finished", () => {
    it("with non-empty queue, advances to next event", () => {
      const stateWithQueue: LiveSignersState = {
        ...start,
        currentEvent: ev("showing", "2026-05-19T20:00:00Z"),
        queue: [ev("next", "2026-05-19T20:05:00Z")],
      };
      const next = liveSignersReducer(stateWithQueue, { type: "event-finished" });
      expect(next.currentEvent?.id).toBe("next");
      expect(next.queue).toEqual([]);
    });

    it("with empty queue, clears currentEvent", () => {
      const state: LiveSignersState = {
        ...start,
        currentEvent: ev("last", "2026-05-19T20:00:00Z"),
      };
      const next = liveSignersReducer(state, { type: "event-finished" });
      expect(next.currentEvent).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
pnpm test -- tests/app/live-signers-reducer.test.ts
```

Expected: tests fail with "Cannot find module".

- [ ] **Step 3: Implement the reducer**

Create `src/app/live-signers-reducer.ts`:

```ts
export type LiveSignerEvent = {
  id: string;
  displayName: string;
  locationText: string | null;
  signedAt: string;
};

export type LiveSignersState = {
  count: number;
  queue: LiveSignerEvent[];
  currentEvent: LiveSignerEvent | null;
  latestSignedAt: string | null;
};

export type LiveSignersAction =
  | {
      type: "poll-response";
      isColdStart: boolean;
      count: number;
      newSigners: LiveSignerEvent[];
    }
  | { type: "event-finished" };

export const QUEUE_CAP = 5;

export function initialLiveSignersState(count: number): LiveSignersState {
  return { count, queue: [], currentEvent: null, latestSignedAt: null };
}

export function liveSignersReducer(
  state: LiveSignersState,
  action: LiveSignersAction,
): LiveSignersState {
  switch (action.type) {
    case "poll-response": {
      const { count, newSigners, isColdStart } = action;

      // Server returns newest-first. We want the queue ordered oldest-first
      // (so older sign events play before newer ones).
      const oldestFirst = [...newSigners].reverse();

      // Compute the cursor: newest signedAt in this response, if any.
      const newestInBatch =
        newSigners.length > 0 ? newSigners[0].signedAt : null;
      const latestSignedAt = newestInBatch ?? state.latestSignedAt;

      // Decide what to enqueue.
      const toEnqueue: LiveSignerEvent[] = isColdStart
        ? // Cold-start: only replay the single most recent signer.
          newSigners.length > 0
          ? [newSigners[0]]
          : []
        : oldestFirst;

      // Drain head to currentEvent if banner is idle.
      let newCurrent = state.currentEvent;
      let restToQueue = toEnqueue;
      if (newCurrent === null && toEnqueue.length > 0) {
        newCurrent = toEnqueue[0];
        restToQueue = toEnqueue.slice(1);
      }

      const newQueue = [...state.queue, ...restToQueue].slice(0, QUEUE_CAP);

      return {
        count,
        queue: newQueue,
        currentEvent: newCurrent,
        latestSignedAt,
      };
    }

    case "event-finished": {
      if (state.queue.length > 0) {
        const [next, ...rest] = state.queue;
        return { ...state, currentEvent: next, queue: rest };
      }
      return { ...state, currentEvent: null };
    }
  }
}
```

- [ ] **Step 4: Run tests to confirm pass**

```
pnpm test -- tests/app/live-signers-reducer.test.ts
```

Expected: all reducer tests pass.

- [ ] **Step 5: Commit**

```
git add src/app/live-signers-reducer.ts tests/app/live-signers-reducer.test.ts
git commit -m "Add pure live-signers state reducer"
```

---

## Task 4: `LiveSignersProvider` client component

**Files:**
- Create: `src/app/LiveSignersProvider.tsx`

This component is not unit-tested — its logic is the reducer (already tested) plus React glue (polling, visibility handling) that's exercised by the smoke test in Task 9.

- [ ] **Step 1: Implement the provider**

Create `src/app/LiveSignersProvider.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import {
  initialLiveSignersState,
  liveSignersReducer,
  type LiveSignerEvent,
} from "./live-signers-reducer";

const POLL_INTERVAL_MS = 60 * 1000;

type ContextValue = {
  count: number;
  currentEvent: LiveSignerEvent | null;
  onEventFinished: () => void;
};

const LiveSignersContext = createContext<ContextValue | null>(null);

export function useLiveSigners(): ContextValue {
  const ctx = useContext(LiveSignersContext);
  if (ctx === null) {
    throw new Error("useLiveSigners must be used inside <LiveSignersProvider>");
  }
  return ctx;
}

type PollResponse = {
  count: number;
  newSigners: Array<{
    id: string;
    displayName: string;
    locationText: string | null;
    signedAt: string;
  }>;
};

function isValidPollResponse(json: unknown): json is PollResponse {
  if (typeof json !== "object" || json === null) return false;
  const o = json as Record<string, unknown>;
  return typeof o.count === "number" && Array.isArray(o.newSigners);
}

export function LiveSignersProvider({
  initialCount,
  children,
}: {
  initialCount: number;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(
    liveSignersReducer,
    initialCount,
    initialLiveSignersState,
  );

  // The reducer's `latestSignedAt` is the cursor we send on the next poll.
  // Hold it in a ref too so the polling closure always sees the latest value
  // without restarting the interval on every state change.
  const cursorRef = useRef<string | null>(null);
  useEffect(() => {
    cursorRef.current = state.latestSignedAt;
  }, [state.latestSignedAt]);

  const isFirstPollRef = useRef(true);

  const poll = useCallback(async () => {
    const cursor = cursorRef.current;
    const url =
      cursor === null
        ? "/api/signers/recent"
        : `/api/signers/recent?since=${encodeURIComponent(cursor)}`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        console.error(
          "[live-signers] poll failed:",
          res.status,
          res.statusText,
        );
        return;
      }
      const json = await res.json();
      if (!isValidPollResponse(json)) {
        console.error("[live-signers] poll response shape invalid");
        return;
      }
      const isColdStart = isFirstPollRef.current;
      isFirstPollRef.current = false;
      dispatch({
        type: "poll-response",
        isColdStart,
        count: json.count,
        newSigners: json.newSigners,
      });
    } catch (err) {
      console.error("[live-signers] poll threw:", err);
    }
  }, []);

  // Mount: fire one immediate poll (cold-start), then poll on an interval.
  useEffect(() => {
    poll();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        poll();
      }
    }, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Catch up immediately when the tab refocuses.
        poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [poll]);

  const onEventFinished = useCallback(() => {
    dispatch({ type: "event-finished" });
  }, []);

  return (
    <LiveSignersContext.Provider
      value={{
        count: state.count,
        currentEvent: state.currentEvent,
        onEventFinished,
      }}
    >
      {children}
    </LiveSignersContext.Provider>
  );
}
```

- [ ] **Step 2: Type-check**

```
pnpm tsc --noEmit
```

Expected: no errors. (The provider isn't yet rendered anywhere; that happens in Task 7.)

- [ ] **Step 3: Commit**

```
git add src/app/LiveSignersProvider.tsx
git commit -m "Add LiveSignersProvider with polling and cursor management"
```

---

## Task 5: `SignatureCount` client component

**Files:**
- Create: `src/app/SignatureCount.tsx`

- [ ] **Step 1: Implement the component**

Create `src/app/SignatureCount.tsx`:

```tsx
"use client";

import { useLiveSigners } from "./LiveSignersProvider";

export default function SignatureCount() {
  const { count } = useLiveSigners();
  return <>{count.toLocaleString()}</>;
}
```

- [ ] **Step 2: Type-check**

```
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```
git add src/app/SignatureCount.tsx
git commit -m "Add SignatureCount client component"
```

---

## Task 6: `LiveSignerBanner` client component

**Files:**
- Create: `src/app/LiveSignerBanner.tsx`

- [ ] **Step 1: Implement the banner**

Create `src/app/LiveSignerBanner.tsx`. The banner reads the `currentEvent` from context, animates in with CSS keyframes, holds for ~5s, then calls `onEventFinished` after the exit animation. Click-through routes to `/signatories/[id]`.

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLiveSigners } from "./LiveSignersProvider";

const HOLD_MS = 5000;

type Phase = "enter" | "hold" | "exit";

export default function LiveSignerBanner() {
  const { currentEvent, onEventFinished } = useLiveSigners();
  // Locking the rendered event prevents a mid-animation event swap from
  // visually glitching the banner. We only pick up the next event after
  // the current one fully exits.
  const [rendered, setRendered] = useState(currentEvent);
  const [phase, setPhase] = useState<Phase>("enter");

  // When a new currentEvent arrives and we have nothing rendered, accept it.
  useEffect(() => {
    if (rendered === null && currentEvent !== null) {
      setRendered(currentEvent);
      setPhase("enter");
    }
  }, [currentEvent, rendered]);

  // Drive the enter → hold → exit timeline.
  useEffect(() => {
    if (rendered === null) return;
    if (phase === "enter") {
      const t = setTimeout(() => setPhase("hold"), 240);
      return () => clearTimeout(t);
    }
    if (phase === "hold") {
      const t = setTimeout(() => setPhase("exit"), HOLD_MS);
      return () => clearTimeout(t);
    }
    if (phase === "exit") {
      const t = setTimeout(() => {
        setRendered(null);
        setPhase("enter"); // reset for next event
        onEventFinished();
      }, 240);
      return () => clearTimeout(t);
    }
  }, [phase, rendered, onEventFinished]);

  if (rendered === null) return null;

  // Translation/opacity per phase.
  const transform =
    phase === "enter" || phase === "exit"
      ? "translateY(-16px)"
      : "translateY(0)";
  const opacity = phase === "enter" || phase === "exit" ? 0 : 1;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-6 z-50 flex justify-center px-4"
      aria-live="polite"
      role="status"
    >
      <Link
        href={`/signatories/${rendered.id}`}
        onClick={() => setPhase("exit")}
        className="glass-banner pointer-events-auto inline-flex max-w-[90vw] items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap rounded-full border border-zinc-900/5 bg-white/70 px-4 py-2 text-sm text-zinc-800 shadow-lg shadow-zinc-900/10 backdrop-blur-md backdrop-saturate-150 transition-transform hover:scale-[1.02]"
        style={{
          transform,
          opacity,
          transition:
            "opacity 240ms ease, transform 240ms ease, scale 200ms ease",
        }}
      >
        <strong className="font-semibold text-blue-600">
          {rendered.displayName}
        </strong>
        {rendered.locationText ? (
          <span className="text-zinc-600">
            from {rendered.locationText} just signed
          </span>
        ) : (
          <span className="text-zinc-600">just signed</span>
        )}
        <span className="ml-1 text-zinc-400">→</span>
      </Link>
    </div>
  );
}
```

The `glass-banner` class hook lets us add a `prefers-reduced-motion` media-query override in `globals.css` without touching the component.

- [ ] **Step 2: Add the reduced-motion override**

Open `src/app/globals.css` and append:

```css
@media (prefers-reduced-motion: reduce) {
  .glass-banner {
    transition: opacity 240ms ease !important;
    transform: none !important;
  }
}
```

- [ ] **Step 3: Type-check**

```
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```
git add src/app/LiveSignerBanner.tsx src/app/globals.css
git commit -m "Add LiveSignerBanner with animation and reduced-motion support"
```

---

## Task 7: Wire provider + banner into root layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Make the layout async, fetch the initial count, mount the provider + banner**

Replace the existing `src/app/layout.tsx` with:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { MyAccountButton } from "@/components/MyAccountButton";
import { getSignatureCount } from "@/lib/db/queries";
import { LiveSignersProvider } from "./LiveSignersProvider";
import LiveSignerBanner from "./LiveSignerBanner";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Bill of Rights",
  description: "A People's Demand for Human-Centered AI",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let initialCount = 0;
  try {
    initialCount = await getSignatureCount();
  } catch (err) {
    console.error("[layout] getSignatureCount failed; starting at 0:", err);
  }

  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <LiveSignersProvider initialCount={initialCount}>
            <MyAccountButton />
            <LiveSignerBanner />
            {children}
          </LiveSignersProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 2: Type-check + build**

```
pnpm tsc --noEmit
pnpm build
```

Expected: no errors. Build succeeds. Layout is now dynamic (db call) — that's fine; the pages were already dynamic.

- [ ] **Step 3: Commit**

```
git add src/app/layout.tsx
git commit -m "Wire LiveSignersProvider + LiveSignerBanner into root layout"
```

---

## Task 8: Replace static count usages with `<SignatureCount />`

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/FloatingSignButton.tsx`

- [ ] **Step 1: Update `src/app/page.tsx`**

Currently `page.tsx` does `await getSignatureCount()` and renders `{signatureCount.toLocaleString()}` in three places. All three should become `<SignatureCount />`, and the page's own count fetch can be deleted (the layout owns the initial value now).

Replace the top of `src/app/page.tsx` — remove the count fetch:

```tsx
// Remove these lines:
//
//   import { getSignatureCount } from "@/lib/db/queries";
//
// ...inside Home():
//   let signatureCount = 0;
//   try {
//     signatureCount = await getSignatureCount();
//   } catch {
//     signatureCount = 0;
//   }
```

Add this import at the top:

```tsx
import SignatureCount from "./SignatureCount";
```

The `Home()` function no longer needs to be `async` for count purposes (check if any other `await` remains; if not, drop `async`). Replace each of the three `{signatureCount.toLocaleString()}` usages with `<SignatureCount />`. Also replace the conditional pluralization that depends on `signatureCount === 1` with a client-side variant or keep server-side (see step 1b).

Concretely, the three count usages in `page.tsx` are:

1. **Line ~233 (subtitle):** `<Link ...>{signatureCount.toLocaleString()} signatures</Link>` → `<Link ...><SignatureCount /> signatures</Link>`.

2. **Lines ~248-253 (mid-page "Join X other real people..."):** This usage uses the count to choose singular/plural ("other real person" vs "other real people" and "who has" vs "who have"). Replace with `<SignatureCount /> other real people` and `who have`. We accept a small grammatical wobble when count=1 (says "1 other real people"); this is a known tradeoff documented in the spec's open questions. Total count <1 is impossible; count=1 only appears for a single moment before the next signer arrives.

   If the count=1 grammar bothers anyone, swap in this client-side variant component as a follow-up:

   ```tsx
   // src/app/JoinClause.tsx
   "use client";
   import { useLiveSigners } from "./LiveSignersProvider";
   export default function JoinClause() {
     const { count } = useLiveSigners();
     const personOrPeople = count === 1 ? "other real person" : "other real people";
     const hasOrHave = count === 1 ? "who has" : "who have";
     return <>{count.toLocaleString()} {personOrPeople} {hasOrHave}</>;
   }
   ```
   Not part of this task.

3. **`<FloatingSignButton signatureCount={signatureCount} />`** → `<FloatingSignButton />` (prop removed in Step 2).

After edits, the relevant chunks of `src/app/page.tsx` should look like:

```tsx
import Link from "next/link";
import HeroSection from "./HeroSection";
import FloatingSignButton from "./FloatingSignButton";
import SignatureCount from "./SignatureCount";

// ... existing pill helpers + articles array unchanged ...

export const dynamic = "force-dynamic";

// ... existing articles array (unchanged) ...

export default function Home() {
  return (
    <div className="flex-1">
      <section className="bg-white px-6 pt-14 pb-10 text-center sm:pt-20 sm:pb-14">
        <h1 className="text-balance text-5xl font-semibold tracking-tight text-zinc-950 sm:text-7xl">
          The AI Bill of Rights
        </h1>
        <p className="mx-auto mt-6 max-w-none text-pretty text-xl leading-8 text-zinc-700 sm:text-2xl">
          <strong className="whitespace-nowrap font-semibold text-zinc-950">
            Nine commitments we&apos;re demanding from every AI company
          </strong>
          <br />
          with{" "}
          <Link
            href="/signers"
            className="font-bold text-blue-600 hover:underline"
          >
            <SignatureCount /> signatures
          </Link>{" "}
          to back them up.
        </p>
      </section>

      <HeroSection />

      <section className="bg-white px-6 pb-32 pt-10 sm:pt-14">
        <p className="mx-auto mb-10 max-w-5xl text-center text-pretty text-2xl font-semibold leading-snug text-zinc-900 sm:mb-14 sm:text-3xl">
          Join{" "}
          <Link
            href="/signers"
            className="font-bold text-blue-600 hover:underline"
          >
            <SignatureCount /> other real people
          </Link>{" "}
          who have signed this AI Bill of Rights
        </p>

        {/* ... unchanged articles ol ... */}
      </section>

      {/* ... unchanged version-footer section ... */}

      <FloatingSignButton />
    </div>
  );
}
```

Note: `whitespace-nowrap` on the strong stays as it is on `main`. If the hotfix PR #12 has already merged before this task runs, that line will already be `sm:whitespace-nowrap` — keep the merged version.

- [ ] **Step 2: Update `src/app/FloatingSignButton.tsx`**

Remove the `signatureCount` prop and replace the inline count with `<SignatureCount />`:

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import SignModal from "./SignModal";
import SignatureCount from "./SignatureCount";

const buttonClasses =
  "glass-button pointer-events-auto rounded-full bg-gradient-to-b from-blue-500/85 to-blue-700/85 px-8 py-3.5 text-sm font-semibold text-white backdrop-blur-md backdrop-saturate-150 transition-transform hover:scale-[1.03] sm:px-10 sm:py-4 sm:text-base";

export default function FloatingSignButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={buttonClasses}
        >
          Sign the AI Bill of Rights →
        </button>

        <p className="pointer-events-auto rounded-full bg-white/70 px-4 py-1 text-xs text-zinc-700 backdrop-blur-md backdrop-saturate-150">
          Join{" "}
          <Link
            href="/signers"
            className="font-bold text-blue-600 hover:underline"
          >
            <SignatureCount /> others
          </Link>{" "}
          who have already signed
        </p>
      </div>

      <SignModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
```

Note: the "Sign the AI Bill of Rights →" button text and the trailing "others" grammar match `main`. If hotfix PR #12 has already merged, keep the hotfix version (`Sign the` + `<span className="block sm:inline">AI Bill of Rights</span>` and no arrow) — just keep `<SignatureCount /> others` in the spot where `{signatureCount.toLocaleString()} others` was.

- [ ] **Step 3: Type-check + build**

```
pnpm tsc --noEmit
pnpm build
```

Expected: no errors. Build succeeds.

- [ ] **Step 4: Commit**

```
git add src/app/page.tsx src/app/FloatingSignButton.tsx
git commit -m "Replace static count usages with <SignatureCount />"
```

---

## Task 9: Manual smoke test

**Files:** none — verification only.

This task does not commit; it validates the end-to-end behavior the unit tests can't cover.

- [ ] **Step 1: Start the dev server in this worktree**

```
pnpm dev
```

If port 3000 is busy: `PORT=3001 pnpm dev`.

- [ ] **Step 2: Open the homepage**

Visit the dev URL. Verify:
- Page paints with the current real signature count in all three places (subtitle, mid-page join, floating button).
- No banner appears immediately (assuming no signs in the past 60 minutes). If there was a sign in the past 60 minutes, exactly one banner appears at the top within ~1 second and dismisses after 5.5 seconds.

- [ ] **Step 3: Simulate a sign event**

In a second browser session (incognito), complete the sign flow with a different OTP-verified Clerk user. Watch the first browser:
- Within ~60 seconds, a floating pill should appear near the top with that user's display name + location.
- The signature count in all three places should increment by 1 at the same moment.
- Clicking the banner navigates to `/signatories/[id]` for that signer.

- [ ] **Step 4: Background-tab test**

Open the homepage and switch to a different tab for 3+ minutes while a sign happens in incognito. When you refocus the first tab:
- The poll fires immediately on `visibilitychange`.
- The banner appears within ~1 second of refocus.
- Count updates.

- [ ] **Step 5: Quiet-period test**

Wait until no signs have happened for >60 minutes (or manually delete recent rows in a scratch DB). Reload the homepage:
- No banner appears.
- Count is accurate.

- [ ] **Step 6: Reduced-motion test**

In DevTools, set "prefers-reduced-motion" to "reduce" (Rendering pane → Emulate CSS media feature). Trigger a sign in incognito. Confirm the banner fades in/out without any translate animation.

- [ ] **Step 7: Mobile viewport test**

In DevTools, switch to iPhone Mini emulation. Trigger a sign. Confirm:
- Banner sits below the OS chrome (not behind the notch).
- Banner text is readable; long city names ellipsize rather than wrap.
- Click-through works on tap.

If any step fails, return to the relevant task and fix. Do not commit fixes to this task — commit on the task that owns the file.

---

## Self-review checklist

The author of this plan ran the following checks before handing off:

- **Spec coverage:** Every section of `docs/superpowers/specs/2026-05-19-live-signer-banner-design.md` has a task. Architecture (Task 7), API contract (Task 2), client architecture (Tasks 3-6), cold-start (Task 3 + Task 4), banner UX with accessibility (Task 6), privacy posture (Task 1 — soft-banned exclusion), error handling (Task 2 + Task 4 catch blocks), testing (Tasks 1, 2, 3 + Task 9).
- **No placeholders:** every code step shows complete code; no "TODO" or "implement appropriately."
- **Type consistency:** `LiveSignerEvent` shape is identical across the reducer (Task 3), the provider (Task 4), and the banner (Task 6). The `id` field is consistently a `string` (signer UUID). `signedAt` is a `string` (ISO) on the wire and in client state, but a `Date` in the DB query type — the route handler's `JSON.stringify` does the conversion automatically, and the client never parses the string back to a Date.
- **Branch coordination:** Task 8 notes the conflict points with hotfix PR #12 and which version to keep depending on merge order.

---
