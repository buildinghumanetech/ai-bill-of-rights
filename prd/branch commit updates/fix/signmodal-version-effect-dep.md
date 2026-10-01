# Branch Progress: fix/signmodal-version-effect-dep

## Progress Update as of 2026-10-01 15:15 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
One-line change: `VERSION` is now in the dependency array of the `getMySignatureStatus` effect in `src/app/SignModal.tsx`. Needed so PR #91 (lint to zero, CI runs `eslint --max-warnings 0`) stays green once merged: the hotfix made `VERSION` a per-render value, which `react-hooks/exhaustive-deps` flags.

### Detail of changes made:
- `src/app/SignModal.tsx`: `[open, isSignedIn]` became `[open, isSignedIn, VERSION]`. VERSION comes from props or LiveSignersProvider and does not change within a session, so behavior is the same; it is also the correct dependency.
- Verified by test-merging PR #91 into main in a scratch worktree: typecheck clean, 103 signing/invite/email tests pass, and this was the only lint finding.
- Main on its own still shows 3 lint errors in this file (set-state-in-effect etc.) under the new rules. Those are exactly what PR #91 fixes; do not chase them here.

### Potential concerns to address:
- Merge this BEFORE #91, or #91's CI (and main's after it) will fail on the warning.

---
