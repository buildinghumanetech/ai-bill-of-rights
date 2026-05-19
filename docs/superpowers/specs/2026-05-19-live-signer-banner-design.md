# Live Signer Banner — Design Spec

**Date:** 2026-05-19
**Status:** Approved (pre-implementation)
**Author:** Drafted with Claude via the superpowers brainstorming skill, in dialogue with the project owner
**Branch:** `feat/live-signer-banner` (off `main`)
**Related work:** Hotfix PR #12 (`hotfix/mobile-hero-overflow`) is in review; this feature touches `FloatingSignButton.tsx` and `page.tsx`, both also modified by the hotfix. Plan to either wait for #12 to merge or rebase before implementation.

---

## 1. Goal

Make the site feel alive. When someone signs the AI Bill of Rights, every visitor currently on the site should see a brief, clickable banner — "Daniel Odio from Alameda, CA just signed →" — and the signature count should increment without a page refresh.

Today, the count is server-rendered via `getSignatureCount()` and only updates on full page reload. New signers are invisible to current visitors. The site has the social-proof data but does nothing visible with it.

## 2. Scope

In scope:

- Server endpoint `GET /api/signers/recent` that the client polls for new signers + current total count.
- Client-side polling provider mounted in the root layout.
- Floating banner pill that flashes briefly on new sign events, with click-through to the signer's public page.
- Live-updating signature count anywhere it currently appears (homepage subtitle, "Join X others" pill, mid-page "Join X other real people…" header).

Out of scope:

- SSE / WebSocket push (deferred — polling at 60s is plenty at current sign rate, and Neon HTTP driver can't `LISTEN/NOTIFY` anyway).
- A "people signed in the past hour" summary chip or activity feed UI.
- Audio / haptic feedback when a signer arrives.
- Localization or i18n of the banner text.

## 3. Decisions log

| # | Decision | Rationale |
|---|---|---|
| 1 | Placement: **floating pill near top of viewport**, fades+drops in, holds 5s, fades+lifts out | Matches existing design language (the "Join X others" pill under the floating Sign button uses the same backdrop-blur glass-pill treatment). Doesn't push page content. |
| 2 | Realtime mechanism: **polling every 60s** (not SSE, not 10s polling) | User's call. Trivially simple, no new infra, no Neon driver constraint. At current sign rate (~days between signs), 60s delay is invisible. Upgrade path to SSE later is straightforward if sign rate climbs. |
| 3 | Cold-start: **replay most recent signer iff signed in the past 60 minutes**; older signers folded silently into count | "Feels alive" without becoming theater. If the most recent sign was 4 hours ago, the user doesn't see a fake-fresh banner on arrival. |
| 4 | Multiple new signers in one poll window: **FIFO queue, up to 5** | At current sign rate this almost never happens. Cap prevents a hypothetical burst from monopolizing the banner for 30s. |
| 5 | Banner persists across client-side navigation | Mounted at layout level. The "live" feel shouldn't disappear when a user clicks into `/why` or `/about`. |
| 6 | Count display: replace each `{signatureCount.toLocaleString()}` usage with a `<SignatureCount />` client component reading from the same provider | One source of truth; all three count displays update in lockstep with the banner. |
| 7 | Suspend polling when `document.hidden` | Backgrounded tabs are wasted requests. Resume on `visibilitychange` → visible. |
| 8 | Exclude soft-banned signers from banner events | Banner is more prominent than the static `/signers` list; "safer than the list" is the right posture for a high-visibility surface. |

## 4. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Server (Fluid Compute)                                          │
│                                                                  │
│  GET /api/signers/recent?since=<iso?>                            │
│  └─ src/app/api/signers/recent/route.ts                          │
│     • If `since` present: signers WHERE signed_at > since        │
│     • If `since` absent:  signers WHERE signed_at > now - 60min  │
│     • Always: SELECT count(*) FROM signatures                    │
│     • JOIN signers (excluding soft_banned_at IS NOT NULL)        │
└─────────────────────────────────────────────────────────────────┘
                            ▲
                            │ fetch every 60s (suspend when hidden)
                            │
┌─────────────────────────────────────────────────────────────────┐
│  Client (root layout)                                            │
│                                                                  │
│  <LiveSignersProvider initialCount={n}>                          │
│  ├─ useState: { count, eventQueue, latestSignedAt }              │
│  ├─ useEffect: setInterval(poll, 60000) + visibilitychange       │
│  └─ Context value: { count, currentEvent, pop }                  │
│                                                                  │
│  ├─ <LiveSignerBanner />        ← consumes context, animates     │
│  ├─ <SignatureCount /> × 3      ← consumes context.count         │
│  └─ <FloatingSignButton />      ← uses <SignatureCount />        │
└─────────────────────────────────────────────────────────────────┘
```

File inventory (additions in **bold**, edits in *italics*):

- **`src/app/api/signers/recent/route.ts`** — the polling endpoint.
- **`src/lib/db/queries.ts`** — add `listRecentSignersSince(since: Date | null, db)` and use it from the route. Filter out `soft_banned_at IS NOT NULL`.
- **`src/app/LiveSignersProvider.tsx`** — `"use client"`, owns polling + state, exposes `useLiveSigners()` hook.
- **`src/app/LiveSignerBanner.tsx`** — `"use client"`, renders the floating pill, animates in/out.
- **`src/app/SignatureCount.tsx`** — `"use client"`, tiny consumer of `useLiveSigners().count`.
- *`src/app/layout.tsx`* — wrap children in `<LiveSignersProvider initialCount={serverCount}>`; render `<LiveSignerBanner />` once at layout level. Server-fetch the initial count here so the provider doesn't paint zero.
- *`src/app/page.tsx`* — replace the three `{signatureCount.toLocaleString()}` usages with `<SignatureCount />`. Page can stay server-rendered; the count component is the only client-side piece.
- *`src/app/FloatingSignButton.tsx`* — replace `{signatureCount.toLocaleString()}` with `<SignatureCount />`; remove the `signatureCount` prop (the component no longer needs it). Already a client component.

## 5. API contract

### Request

```
GET /api/signers/recent
GET /api/signers/recent?since=2026-05-19T20:30:00.000Z
```

- `since` (optional, ISO-8601 timestamp): return signers whose `signatures.signed_at > since`.
- If omitted: return signers whose `signatures.signed_at > now - 60 minutes`. This is the cold-start mode.

### Response

```json
{
  "count": 7,
  "newSigners": [
    {
      "id": "ef21e957-1415-4f00-b6ce-d058767d45bb",
      "displayName": "Daniel Odio",
      "locationText": "Alameda, CA, US",
      "signedAt": "2026-05-19T20:34:12.703Z"
    }
  ]
}
```

- `count`: current total from `SELECT count(*) FROM signatures` (no filtering — historical count is honest even for soft-banned).
- `newSigners`: most recent first, but the client will reverse to play oldest-first so the queue order matches sign order.
- Soft-banned signers (`signers.soft_banned_at IS NOT NULL`) are excluded from `newSigners` (but their signatures still count in `count`).
- Cache-Control: `no-store`. This endpoint must not be cached.

### Errors

- `500` with `{ error: "..." }` on DB failure. Client swallows and retries on next interval.
- No auth required — fully public, like the existing `/signers` page.

## 6. Client architecture

### `LiveSignersProvider`

```tsx
type LiveEvent = {
  id: string;
  displayName: string;
  locationText: string | null;
  signedAt: string;
};

type LiveContextValue = {
  count: number;
  currentEvent: LiveEvent | null;  // The event the banner is currently showing
  dismiss: () => void;             // Called by the banner when its animation ends
};
```

State held internally:

- `count: number` — starts at `initialCount` (server-rendered), updated on every poll response.
- `queue: LiveEvent[]` — events waiting to be shown.
- `currentEvent: LiveEvent | null` — the one currently displayed (drained from queue).
- `latestSignedAt: string | null` — the cursor for the next poll's `since` param. Set from the most recent event ever received (whether shown as banner or silently folded in).

Polling logic (in `useEffect`):

1. On mount, send the first request **with no `since` param** to get cold-start replay window.
2. After response, set `count = response.count`. Pick the single most-recent signer in `newSigners` (if any) and push to queue. Set `latestSignedAt` to the newest `signedAt` regardless of whether it was queued.
3. Start `setInterval(60_000)`.
4. Each interval tick (if `document.visibilityState === "visible"`): send request with `since=latestSignedAt`. Push all `newSigners` to queue (FIFO, capped at 5). Update `count` and `latestSignedAt`.
5. On `visibilitychange → visible`, fire one immediate poll.
6. Cleanup on unmount: clear interval and event listener.

Queue drain logic: a separate `useEffect` watches `currentEvent`. If `null` and queue is non-empty, set `currentEvent = queue.shift()`. The banner calls `dismiss()` 5s after it appears (its own timer); `dismiss` clears `currentEvent`, triggering the next item to drain.

### `LiveSignerBanner`

- Renders nothing when `currentEvent === null`.
- When present: a `<Link href={\`/signatories/${currentEvent.id}\`}>` styled as a pill matching the floating "Join X others" pill (white/70 bg, backdrop blur, rounded-full, small drop shadow), positioned `fixed top-6 left-1/2 -translate-x-1/2 z-50`.
- Content: `<strong>{displayName}</strong> from {locationText} just signed →`
- Animation: CSS keyframe `signer-banner-in` (fade 0→1, translateY -16 → 0) over 240ms ease-out on mount; on unmount, the component holds for 5s, then plays `signer-banner-out` (fade 1→0, translateY 0 → -16) over 240ms ease-in. After the out animation finishes, call `dismiss()`.
- Implementation: a single `useEffect` with a chained `setTimeout(5000)` then `setTimeout(240)` to call `dismiss`. Or use `onAnimationEnd` with named CSS animations — cleaner, fewer timers.
- `pointer-events-auto` so it's clickable despite the parent layout having other pointer-events-none floats.

### `SignatureCount`

```tsx
"use client";
export default function SignatureCount() {
  const { count } = useLiveSigners();
  return <>{count.toLocaleString()}</>;
}
```

That's the whole thing. Replaces three usages of `{signatureCount.toLocaleString()}` across `page.tsx` (subtitle, mid-page heading) and `FloatingSignButton.tsx` (joining text).

### Initial render path

`src/app/layout.tsx` is currently a server component. Strategy:

1. Server-side `await getSignatureCount()` in `layout.tsx`.
2. Pass to `<LiveSignersProvider initialCount={count}>`.
3. Provider hydrates with that value; first paint shows the correct number; polling takes over after mount.

This means we read the count **once per request** on the server (cheap — same query the page already does) plus once per 60s from each open tab. Negligible.

## 7. Cold-start behavior

The cold-start window is **60 minutes**.

Flow:

1. User lands. Layout server-renders with current count (say, 7).
2. Provider mounts client-side. Sends `GET /api/signers/recent` with no `since`.
3. Server responds with `count: 7` and `newSigners: [...]` containing every signer in the past 60 minutes (most-recent-first).
4. Provider sets `count` (already accurate, but in case of race), takes `newSigners[0]` (the most recent), and queues it as the cold-start replay. Older signers in the window are *not* queued — count was already correct.
5. `latestSignedAt` is set to `newSigners[0].signedAt` (the newest), so the next poll's `since` is correct.

Edge cases:

- **`newSigners` is empty (no signs in past 60 min):** no replay. Just sets `latestSignedAt = null` initially; the next poll uses `since = null` → asks again for past-60-minute window. Once any sign event happens, `latestSignedAt` gets populated and subsequent polls use cursor mode.
- **User refreshes during a sign burst:** they'll see a replay for the single most recent one. Older recent ones are reflected only in `count`. Acceptable — better than 5 banners on page load.

## 8. Banner UX

Single floating pill, near top of viewport, **z-50**, **pointer-events-auto** so it's clickable.

Visual:

```
       ┌──────────────────────────────────────────┐
       │ Daniel Odio from Alameda, CA just signed → │
       └──────────────────────────────────────────┘
```

- Same glass-pill treatment as the existing "Join X others" pill: `bg-white/70 backdrop-blur-md backdrop-saturate-150 border border-zinc-900/5 rounded-full shadow-lg shadow-zinc-900/10`.
- `<strong>` on the display name in `text-blue-600` (matches the count link color).
- Trailing `→` glyph in `text-zinc-500` separated by margin from the rest of the text.
- `whitespace-nowrap` + `max-w-[90vw]` + `overflow-hidden text-ellipsis`. On extremely narrow viewports (≤320px), the city portion ellipses out rather than wrapping. The structural layout (single-line pill) is preserved at every viewport width.
- Hover: subtle `scale(1.02)` transform and stronger shadow. Cursor: pointer.
- `aria-live="polite"` on the banner container so screen readers announce new sign events without interrupting current speech. `role="status"`.
- Each banner instance renders the full string as a single accessible name (no nested links / nested interactive elements).

Animation:

- Enter: 240ms ease-out, `opacity 0 → 1` + `translateY(-16px) → 0`.
- Hold: 5000ms.
- Exit: 240ms ease-in, reverse.
- Total time visible: ~5.48s.
- `prefers-reduced-motion: reduce`: skip both transforms; fade only. Implemented via a `@media (prefers-reduced-motion: reduce)` block in the keyframe definitions.

Interaction:

- Click anywhere on the pill → `next/link` push to `/signatories/${id}`. Banner immediately dismisses.
- Hovering does NOT pause the timer in MVP. (Future polish: pause on hover.)

## 9. Privacy posture

The banner exposes exactly the same fields already publicly visible on `/signers` and `/signatories/[id]`:

- `display_name` (chosen by the signer at sign time)
- `location_text` (also chosen by the signer at sign time, optional)
- The signer's UUID, used only as a `/signatories/[id]` slug

No new data exposure. No client-side fingerprinting. No third-party analytics on the banner.

Soft-banned signers are excluded from `newSigners` so the banner isn't a vector for re-amplifying flagged content. Soft-ban is a soft-delete; their existing public page may still exist depending on the moderation flow.

## 10. Error handling and edges

- **DB failure:** the route returns 500. Client logs `console.error`, returns. Count stays at last-known value. Next poll retries.
- **Network failure / timeout:** same as DB failure — handled by the polling `try/catch`.
- **Malformed response:** schema-validate with a tiny inline guard (`typeof count === "number"` etc.). On failure, skip this tick.
- **Clock skew:** `signed_at` cursor is server-authoritative. Client never generates timestamps; it only echoes back the most recent `signedAt` string it received. No risk of skew-driven misses.
- **Race between cold-start replay and first interval poll:** the first interval poll uses `since = latestSignedAt` set by the cold-start response. If no signers existed in the past 60 minutes, `latestSignedAt = null` and the next poll also uses no-since mode — harmless duplicate. Acceptable.
- **Multiple tabs from one user:** each tab polls independently. Each tab shows banners independently. No coordination via BroadcastChannel in MVP.
- **Self-signature replay:** if the current visitor is the one who just signed, they'll see their own banner on their next page. Mildly funny, not harmful. Not worth filtering in MVP.
- **Page load during long quiet stretch:** no replay, no banner, count is accurate. Site doesn't "feel alive" but doesn't lie about activity. This is the right tradeoff per decision #3.

## 11. Testing

Vitest unit tests against pglite (matches existing test setup):

1. `listRecentSignersSince(null)` returns signers from the past 60 minutes only.
2. `listRecentSignersSince(t)` returns only signers with `signed_at > t`.
3. Both queries exclude soft-banned signers.
4. Both queries return signers ordered by `signed_at DESC`.
5. Route handler returns `{ count, newSigners }` shape with expected fields.
6. Route handler 500s gracefully on DB error (mocked) without leaking internals.

No banner UI tests. Manual smoke covers:

- Open site, watch for 60s with another tab signing — banner appears within a minute.
- Tab in background for 5+ minutes; refocus; banner replays correctly if there was a sign during background.
- Click banner mid-animation; verify nav to `/signatories/[id]`.
- Open site after a quiet hour; verify no banner, correct count.
- Verify count visibly updates from N to N+1 the moment the banner appears.

## 12. Open questions / deferred

- **SSE upgrade:** if sign rate climbs above ~1/min, polling-at-60s starts feeling laggy. Upgrade to SSE with Upstash Redis pub/sub. Not now.
- **"Pause on hover" for the banner:** nice-to-have polish; deferred.
- **Mobile-specific layout:** the pill at `top-6` may collide with mobile browser chrome on iOS Safari. Verify during manual smoke; tweak to `top-4` or use safe-area insets if needed.
- **Cross-tab coordination:** if user has 3 tabs open, each polls. Could coordinate via BroadcastChannel + leader election to drop to 1 poll. Tiny optimization, not worth complexity.

---
