# Brainstorm: making comments easy for Erika to see and answer

**Date:** 2026-07-24
**Status:** brainstorm — no spec, no plan, nothing committed to yet
**Problem statement (Erika's words):** "Make it easier for me to look at comments. I'm often pretty slow to respond. Maybe they would show up as a text message, and I could respond as a text message — but don't limit to that."

---

## 1. What the code actually does today

Worth writing down, because it reframes the problem.

| Thing | Current state | File |
| --- | --- | --- |
| Comment storage | `comments` table; anchored to a document sentence (`anchor_id`) **or** a proposal (`proposal_id`); threaded via `parent_comment_id`; soft-hide via `hidden_at` | `src/lib/db/schema.ts:147` |
| Notification to Erika when a comment arrives | **None.** Nothing fires unless someone @-mentions her | `src/server/actions/comments.ts:134` |
| @mention notification | Email via Resend, best-effort, fired async after insert | `src/server/actions/comments.ts:134-216` |
| @mention matching | Exact string match of the full display name after `@` | `src/lib/comments/mentions.ts:8` |
| Admin comment UI | Flat list of the newest 100 comments. Two buttons: Hide / Unhide. **No reply, no filter, no search, no unread state** | `src/app/admin/comments/page.tsx` |
| Read / unread / handled state | Does not exist anywhere in the schema | — |
| SMS delivery | Not wired. Code comment explicitly says it would need Twilio | `src/server/actions/comments.ts:172-177` |
| Scheduled jobs | None. No `vercel.json`, no cron routes | — |
| Signals we already collect but don't use for triage | `comment_votes`, `comment_upvotes`, `comment_reports`, `comment_mentions`, signer `created_at` | `src/lib/db/schema.ts` |

**Two conclusions that shape everything below:**

1. **The gap is bigger than "notifications are the wrong channel" — there is no notification at all** for an ordinary comment. Today the only way Erika learns a comment exists is by loading the site.
2. **A channel alone won't fix slowness.** Two other things are missing and each is independently a bottleneck: (a) no notion of *which* comments still need her, and (b) no way to reply from anywhere except a desktop browser. Fixing only the channel converts "I don't know comments arrived" into "I get pinged and still can't act." Ship channel + triage state + reply path together, or the pings become noise.

**Also a live bug, not just a gap:** `parseMentions` requires an exact match on the full display name. `@Erika` does not match a display name of `Erika Anderson` — only `@Erika Anderson`, spelled and cased exactly, does. So the one notification path that exists is probably silently missing real mentions right now. Cheap fix, high value, independent of everything else here.

---

## 2. The three axes

Every idea below is a point in this space. Naming the axes makes it obvious why "just text me" is necessary but not sufficient.

- **Axis A — Delivery: how a comment reaches her.** SMS, email, push, Telegram, Slack, voice, ambient.
- **Axis B — Triage: how she knows which ones matter.** Ranking, unread state, snooze, digests, AI synthesis.
- **Axis C — Response: how she answers with minimal effort.** Reply-by-text, AI-drafted replies, one-tap acknowledgments, voice, delegation.

The leverage for "I'm often pretty slow" is mostly in **B and C**, not A. A is what she asked for and is the enabling step; the win is what rides on it.

---

## 3. Axis A — Delivery channels

### A1. SMS via Twilio (the literal ask)
A comment lands → Twilio SMS to her phone. Zero new apps, works on the lock screen, and she already has the reply muscle memory.

- **Cost:** ~$0.008/message + ~$1.15/mo for the number. Negligible at this volume.
- **Real friction:** US A2P 10DLC registration. Even a bot texting one recipient needs a registered campaign, or carriers filter the messages. Low-volume registration is cheap but takes days and paperwork. **This is the main reason SMS is not the fastest path to a working prototype.**
- **Design constraint:** SMS has no threads. If she replies "yes", the system has to know *to what*. See C1 — this is the crux of the whole reply-by-text idea.
- **Character budget:** 160 chars means the comment body gets truncated. She'll usually need a link, which means she's on the site anyway — unless replies come back over SMS too (C1).

### A2. Telegram bot (technically the best fit; wrong app for her, maybe)
Free, instant, unlimited length, **real reply-threading**, and **inline buttons** — so a message can carry `[Reply] [👍 Ack] [Snooze] [Hide]` as tappable buttons instead of asking her to remember a syntax. Inbound webhook is ~30 lines. No carrier registration, no per-message cost.

Everything reply-by-text wants to be, Telegram already is. The only real objection is "I don't want another app on my phone." Worth honestly weighing: an afternoon of work vs. a week of 10DLC.

### A3. WhatsApp Business API
Same threading and button advantages as Telegram, and more people already have it. But template-message approval and a 24-hour customer-service window make bot-initiated messages genuinely annoying. Not worth it here.

### A4. Email, but actually good
Resend is already wired (`src/lib/email/send.ts`). An email that looks like a GitHub notification — quoted anchor text, the comment, `[Reply] [Snooze] [Hide]` buttons, and a "reply above this line" inbound address — is *hours* of work, not days.

Everyone dismisses email as the slow channel. But **inbound email reply-to-post is the single highest-value / lowest-effort item in this document**: Resend supports inbound webhooks, and email has native threading, unlimited length, and works from her Watch, phone, and laptop. If exactly one thing gets built, build this.

### A5. Web push / PWA
Free, no vendor, works on iOS 16.4+ once the site is added to the Home Screen. Notification actions allow buttons. Downside: iOS web push is quietly unreliable and "add to Home Screen" is a real adoption step. Good as an add-on, bad as the primary.

### A6. Slack or Discord
If a `#comments` channel existed, threads are free and other people can help triage — which unlocks delegation (C5) as a side effect. Best option *if* the team already lives in one. Overkill for an audience of one.

### A7. Ambient / zero-effort surfaces
Not a primary channel; the point is a truthful sense of volume without opening anything.
- A macOS menu-bar count, or a Raycast/Sparkle command showing "3 need you."
- A daily calendar event auto-created at 4pm titled "5 comments waiting (2 need you)" — she already looks at her calendar.
- A `/admin/comments.rss` feed. Ten lines of code, and it turns any reader app into an inbox.

### A8. Voice
A scheduled phone call that reads the day's comments aloud during a commute or walk, with "press 1 to record a reply." High delight, high build cost, and easy to get wrong. Filed as a wildcard, not a plan.

---

## 4. Axis B — Triage: knowing which comments need her

### B0. The admin view *is* the inbox (start here)
Erika's note: comments could live in the admin view as well. Agreed — and it's stronger than "as well." The admin area is the one surface she already owns, already has auth for, and already visits; every push channel above is ultimately just a *pointer back to it*. So the admin view should be the canonical inbox, and SMS/email should be thin pokes that link into it. Building the pokes first would mean texting her toward a page that can't do anything.

Concretely, `/admin/comments` today is a flat 100-row list with Hide/Unhide (`src/app/admin/comments/page.tsx`). What it wants to be:

- **A real inbox, not a log.** Group by anchor / thread rather than one flat reverse-chronological stream, so a 6-comment argument about Right #3 reads as one item instead of six.
- **Reply inline.** The single biggest missing piece. `submitCommentAction` already supports admin "post as" and threading via `parentCommentId` — the server side is done, there's just no UI for it in admin.
- **Unread and handled state**, per B2, with counts.
- **Filters/segments:** `needs you` · `unanswered` · `reported` · `new voices` · `all`. Default to `needs you`.
- **Show the anchored sentence next to the comment** so she doesn't have to open the document in another tab to understand what's being discussed. Most of the per-comment cost is context reconstruction, not typing.
- **Batch actions:** select several → one "thanks, noted" reply, or mark all handled.
- **A count badge everywhere in admin**, so any admin page tells her there's something waiting.
- **Live-updating** so a Friday triage session doesn't need reloads.
- **Reported comments as a separate queue** — moderation decisions are a different mental mode than replying.

This is also where AI assistance is cheapest to add: drafts (C2) rendered inline in the reply box, and the digest (B3) as a header summary at the top of the page. No channel plumbing, no vendor, no carrier registration — and it makes every later channel worth having.

### B1. An importance score (the core idea of this section)
Not every comment needs Erika. Ranking is what makes a small number of notifications trustworthy — and trustworthy notifications are what she'll actually keep enabled. Signals already in the database:

- Direct reply to a comment of hers → **highest**
- @-mentions her → high
- Contains a question mark, or "how do you", "what about", "why does" → high
- Author's first-ever comment (a new voice, worth welcoming) → high
- Has upvotes / net-positive `comment_votes` → medium-high
- Reported (`comment_reports`) → needs a moderation decision, different queue
- Third+ comment in a thread already answered → low
- Note that "no reply from anyone yet, and 48h old" is its own escalation signal
- Recompute nightly: an old comment that just got 5 upvotes should resurface

Output: `needs-you` / `fyi` / `handled`. Only `needs-you` earns a text.

### B2. Explicit triage state
The schema has no read/unread. A small table — `comment_triage(comment_id, state, snoozed_until, handled_at, note)` with states `unseen | needs_reply | snoozed | replied | ignored` — is what makes an inbox an inbox. Enables "snooze 3 days," "mark handled without replying," and an honest count of what's actually outstanding.

### B3. AI-synthesized digest instead of a list
This is the "slow to respond" fix hiding in plain sight. Twenty individual notifications is work; one message that says:

> **Yesterday: 14 comments from 9 people.**
> **Themes:** (1) six people want Right #3 to name biometric data explicitly — strong consensus, probably a real edit; (2) two people confused by the "revoke" flow; (3) one hostile comment on #7, already downvoted.
> **Needs you:** @maria asked whether orgs can attest to a fork (nobody can answer this but you). → [reply]

…is 20 seconds of reading. Claude reads the comments, clusters them, drafts the digest. This is also the thing that scales when the site gets popular, where per-comment notifications collapse.

### B4. Cadence and quiet hours
Instant for `needs-you`, one digest at 8am for everything else, hard quiet hours 9pm–7am, and a hard daily cap (e.g. 3 texts) so a comment surge can never turn into a phone flood. Cadence should be configurable without a deploy — a row in a settings table, or reply `SLOW` / `FAST` to the bot.

### B5. A mobile-first inbox (Superhuman for comments)
`/admin/comments` is a desktop list with two buttons. A phone-shaped view — swipe left to snooze, right to mark handled, tap to reply, keyboard-driven `j`/`k`/`r` on desktop — turns a 4-minute session at a laptop into a 40-second session in line for coffee. Pairs with any delivery channel.

### B6. Weekly rollup that doubles as content
There's already a Substack. A "what the commenters said this week" rollup is simultaneously her triage tool and a publishable artifact — the same synthesis does double duty. This is the highest-value-per-unit-effort idea in the doc for reasons that have nothing to do with notifications: it converts an obligation into output.

---

## 5. Axis C — Response: replying with minimal effort

### C1. Reply-by-text, and the threading problem
The crux: SMS carries no context, so `"yes, good point"` has to resolve to a specific `comment_id`.

Options, best first:

1. **Short reply codes.** Every outbound message ends with a code: `…— reply R7 <your text>`. She texts `R7 Great point, adding to v0.4`. Robust, works across channels, survives out-of-order replies. Slightly ugly.
2. **Implicit "most recent."** A bare reply attaches to the last comment she was sent. Zero friction, but ambiguous the moment two notifications arrive close together — and a misfire posts publicly to the wrong thread.
3. **Per-comment reply address (email only).** `reply+<comment_id>@…` — invisible, exact, and email clients handle the threading. This is why A4 keeps winning.
4. **Telegram native reply.** Swipe-to-reply carries the message reference for free. Zero syntax.

**Safety rails, because these post publicly under her name:** echo back a confirmation (`Posted as reply to @maria ✓ [undo]`), keep a 60-second undo window, verify the sender is her exact phone number *and* require an unguessable code in the reply (a spoofed sender must not be able to post as her), and rate-limit inbound. A misfire here is a public mistake on a document about AI ethics, which is a worse failure mode than a slow reply.

### C2. AI-drafted replies she approves (the biggest lever)
The reason replying is slow usually isn't logistics — it's that a good reply takes composition energy. So invert it: Claude drafts the reply in her voice from the comment, the anchored sentence, and the document context. The text she receives is:

> @maria asks if orgs can attest to a fork.
> **Draft:** "Great question — attestations are pinned to a specific version, so forks aren't covered today. Worth adding."
> Reply `1` to send · `2` for a shorter version · or type your own.

Replying becomes one keystroke. Editing a draft is ~10x cheaper than composing. Nothing posts without her approving it, so it's not an autonomous bot with her name on it.

Escalation path if she trusts it: an allowlist of question types Claude may answer *as clearly-labeled AI* ("answered by Claude on Erika's behalf, unreviewed"), with everything else queued. Big trust decision, worth its own conversation, and disclosure is non-negotiable on this particular site.

### C3. One-tap acknowledgment
Sometimes there's nothing to say and silence still reads as neglect. A ❤️ / 👍 / "Erika read this" marker is a real product feature: it costs one tap, and it makes a commenter feel heard. Cheapest possible response, and it drains most of the queue.

### C4. Voice reply
She talks for 15 seconds; Whisper transcribes; Claude cleans up the filler; she gets the text back to confirm before it posts. Talking is ~4x faster than thumb-typing and works while walking. Genuinely good fit for someone whose bottleneck is composition time.

### C5. Delegation
A `trusted_responder` flag: a few community members can reply with a visible "community responder" badge, so factual questions never wait on her. Public replies from the actual community are arguably *better* than replies from the author — it's a bill of rights with signers, and their voices carry weight. Needs a scope decision (moderation power? hide power? just replies?).

### C6. Set expectations publicly — the zero-code option
> "Erika reads every comment and replies in weekly batches, usually Fridays."

This dissolves a large part of the problem without a single line of code, because "slow" is only a problem relative to an unstated expectation. Pair with an "office hours" ritual — a 30-minute Friday block where she replies to everything at once. Batching is faster per reply than context-switching, and it makes the slowness legible instead of apologetic.

---

## 6. Combinations worth taking seriously

**Recommended stack — "inbox first, texting second."**

- **Phase 0 (a few hours, no new vendors, unblocks everything):** make `/admin/comments` a real inbox per **B0** — inline **Reply** box, unread markers, a `needs you` filter, and the anchored sentence shown in context. Plus: fix `parseMentions` so `@Erika` matches, and email Erika on *every* new comment (it's currently zero). Right now she can't even answer from the admin page. This alone probably halves her response time, and every later channel just links into it.
- **Phase 1 (~a day, still no new vendors):** inbound email replies via Resend + per-comment reply addresses (A4 + C1.3), plus the `comment_triage` table (B2) and the importance score (B1). Now she can reply from her phone's mail app, from anywhere, and the system knows what's outstanding.
- **Phase 2 (the literal ask, once 10DLC clears):** Twilio SMS for `needs-you` only, with reply codes, undo, and quiet hours (A1 + C1.1 + B4). Low volume by construction, because Phase 1 built the ranking that decides what deserves a text.
- **Phase 3 (the actual step-change):** AI-drafted replies (C2) + the synthesized digest (B3) + one-tap ack (C3). This is where "slow to respond" stops being true.

**Fast alternative if the goal is "working this week":** Telegram bot instead of SMS (A2). Buttons, threads, drafts, and undo all come free, and it skips carrier registration entirely. Worth 10 minutes of consideration before committing to SMS.

---

## 7. Wildcards

- Comments as a **task list** — pipe `needs-you` into Todoist/Linear/Things so they live where her other obligations live and inherit an existing habit.
- **Printed weekly digest.** Paper is read; tabs are not.
- A **"comment of the week"** highlighted on the homepage — replying becomes a curation act with public upside rather than a chore.
- **Reply deadline SLA** shown publicly ("oldest unanswered: 3 days"). Nothing motivates like a visible counter — and it's honest.
- **Let commenters mark their own comment "needs a reply from Erika"** — with a small budget, e.g. 1/month per signer. Crowdsources the ranking to the people who know their own intent, and the budget prevents abuse.
- **A Sparkle agent as the triage layer:** a scheduled agent reads new comments, drafts replies, opens a PR for document edits the comments imply, and texts her one summary. The document edits are the real prize — several comments are proposed edits in disguise.
- **Comment → proposed-edit conversion.** When Claude notices a comment is really an edit request, offer "turn this into a proposal" (`proposed_edits` already exists). Reduces the number of things needing a *reply* at all, which beats replying faster.

---

## 8. Risks and things to decide

- **A public reply posted by mistake** is worse than a slow reply. Undo window, confirmation echo, and never auto-post without approval.
- **Sender spoofing.** Caller ID is forgeable; a phone number alone must not be sufficient authorization to post as Erika.
- **AI replies must be labeled** on a site about AI ethics. Non-negotiable, and arguably an opportunity to model the behavior the document asks for.
- **Notification fatigue** kills the whole system. If she mutes the channel, everything above is wasted. This is the real argument for ranking-before-texting.
- **Cost of ownership.** Every channel is a thing that breaks silently. Email (already wired) breaks least.
- **Open question:** does "comments" here mean only site comments, or also GitHub PR review comments? The inbox pattern generalizes, but the plumbing is completely different.

---

## 9. Smallest next step

If only one thing happens: **the inline Reply box on `/admin/comments`, plus an email to Erika on every new comment.** No vendors, no migrations, a couple of hours. It removes the two hardest blockers (she doesn't know, and she can't answer from the page she's on) before anything gets architected — and it makes the admin view the place every future notification points at.
