# Branch Progress: feat/invite-email-peoples-bill-logo

## Progress Update as of 2026-10-01 14:30 Pacific
*(Most recent updates at top)*

### Summary of changes since last update
The signing invitation email now says "The People's AI Bill of Rights" everywhere (subject, body, sign-off) and has an HTML version with the gold Building Humane Tech torch on top. Copy is otherwise unchanged.

### Detail of changes made:
- `src/lib/email/templates.ts` `signInvitation`: renamed to the full name; now returns `{ subject, text, html }`. New optional `logoUrl` param; omitted means no image.
- `src/server/actions/invite.ts`: passes `logoUrl` (`<site origin>/images/email/torch-gold.png`) and sends `html` along with `text`.
- `public/images/email/torch-gold.png`: torch cropped from `public/images/bht/683485ba3eaa511838e065fd_gold-white-v3.webp`. PNG on purpose: Gmail and Outlook do not render SVG, and the URL must be absolute.
- `tests/lib/email.invitation.test.ts`: pins the name, the logo URL, both tagged links in the HTML, and HTML escaping.

### Potential concerns to address:
- The logo URL is built from `NEXT_PUBLIC_SITE_URL`, which falls back to `https://ai-for-people.org` if unset. Production must have it set to theaibill.org or the image will not load.
- Other emails (sign confirmation, welcome, mentions) still say "the AI Bill of Rights". Only the invitation was in scope.
- Some mail clients block images by default; the email still reads fine without it (alt is empty by design).

---
