# Branch Progress: fix/dark-mode-contrast

## Progress Update as of 2026-05-29 13:00 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Code-review/simplification pass: removed all 126 now-dead `dark:` Tailwind utilities across 17 files. Since the previous commit made dark mode globally inert (`@custom-variant dark` with no `.dark` class ever applied), these variants rendered nothing — they were dead code implying a dark theme that no longer exists. This is a pure dead-code removal; rendered output is byte-identical to the previous commit (already verified light-readable in the browser).

### Detail of changes made:
- Mechanically stripped every `dark:…` token from className strings in 17 files (heaviest: `src/app/v/[version]/as-code/page.tsx` 40, `src/app/admin/attestations/page.tsx` 15, `src/components/AttestationForm.tsx` 12; full list in the commit). Base light-mode utilities were preserved untouched.
- `src/app/globals.css` was intentionally **not** stripped: the `@custom-variant dark (&:where(.dark, .dark *))` line is kept as a one-line guard so any future stray `dark:` utility (or copy-pasted snippet) can't silently reintroduce media-query dark mode.
- Review confirmed: no `.dark` class is ever added anywhere (variant stays inert), no other `prefers-color-scheme` sources, only one CSS file, and all formerly-`dark:`-paired hardcoded-dark elements (buttons/inputs in sign flow, admin) fall back to their readable light bases.
- Verified the sweep produced no malformed class strings (no double/leading/trailing spaces, no emptied classNames, template-literal `cfg` class objects handled correctly).

### Potential concerns to address:
- Build/lint of this 17-file sweep should be re-run (the edits are pure string-content removals, so syntax is unaffected, but a fresh `npm run lint` / `npm run build` is the final automated gate before push).

---

## Progress Update as of 2026-05-29 12:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
Fixed two reported dark-mode readability bugs (comment box; resource/"Connects to" pages) by removing the leftover, never-intended Next.js scaffold dark mode entirely and making the site consistently light. After an earlier per-element `dark:`-variant attempt was reset, the final fix is three lines in `globals.css` plus explicit light colors on the two comment textareas.

### Detail of changes made:
- **Root cause:** `src/app/globals.css` carried a scaffold `@media (prefers-color-scheme: dark)` block that swapped `--background`→`#0a0a0a` / `--foreground`→`#ededed`. The app has no theme toggle, no theme lib, a theme-agnostic `layout.tsx`, and its primary flow (homepage, document, comments) is light-only — so dark mode was unintentional scaffold, and the source of both bugs plus latent ones.
- **`src/app/globals.css`** (the fix):
  1. Deleted the `@media (prefers-color-scheme: dark)` body-variable swap → body stays white, text stays dark.
  2. Added `color-scheme: light` to `:root` → native controls (textarea, scrollbars, autofill) render light under OS dark mode.
  3. Added `@custom-variant dark (&:where(.dark, .dark *));` → **critical**: Tailwind's `dark:` variant defaults to `prefers-color-scheme: dark` and is independent of the body swap. Without this, the ~17 files' `dark:` text utilities still fired under OS dark mode, painting light text on the forced-white backgrounds (this is exactly the `/why` subtitle regression we caught). Redefining `dark:` as class-based — with no `.dark` class ever added — makes every `dark:` utility inert.
- **`src/components/CommentComposer.tsx`** and **`src/components/MentionTextarea.tsx`**: gave the comment textareas explicit `bg-white text-zinc-950 placeholder:text-zinc-400` (base utilities) instead of relying on inherited color. No `dark:` variants added.
- **Verification (Chrome, OS in dark mode throughout):** resource page `/resources/ftc-guidance-deceptive-ai` → white bg, black text; comment textareas (via a temporary `/comment-preview` route, since the real composer needs `DATABASE_URL`) → white box, black text + readable mention popup; `/why` → subtitle now dark/readable; homepage clean. Temp preview route was deleted before commit.
- **Automated:** `npm run lint` shows the unchanged pre-existing baseline (161 errors / 9 warnings); nothing new from these files. `npm run build` only fails at prerender on missing `DATABASE_URL`/Clerk keys (environment-only).

### Potential concerns to address:
- **Dead `dark:` variants (overcomplication):** ~17 files still contain `dark:` utilities that are now permanently inert. They're harmless but misleading (imply a dark theme that doesn't exist). Candidate for a follow-up simplification sweep to strip them; deferred so this fix stays minimal and reviewable.
- The PR must NOT include the `package.json`/`package-lock.json` churn from the local `npm install` + `npm audit fix --force` (repo uses pnpm); those were reverted/removed and are excluded.
- `node_modules` is in a partially-broken state locally (the `audit fix` removed packages; ESLint can't load `prop-types` in some environments) — unrelated to this change.

---
