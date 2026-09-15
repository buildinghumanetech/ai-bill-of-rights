/**
 * OPTIONAL mirror of a new-right proposal into a GitHub issue.
 *
 * OFF unless both GITHUB_PROPOSAL_REPO ("owner/repo") and GITHUB_TOKEN are set.
 *
 * WHY IT IS A MIRROR AND NOT THE STORE. GitHub Issues was the obvious home for
 * this until you look at what the site already has: one-person-one-vote is
 * enforced by `proposal_upvotes`' unique index against a *verified signer*,
 * and endorsing a proposed right is the same act as signing the document. On
 * GitHub, a 👍 is one GitHub account, a population that does not overlap the
 * signers and is trivially farmed — the count would stop meaning "people who
 * back this" on day one. Issues also cannot see `base_version_id`, so
 * proposals could not be scoped to the draft they were written against, and
 * the comment threads would split across two systems.
 *
 * What GitHub is good for here is the editorial trail: a public, diffable
 * record next to the version files, which is exactly what a mirror gives.
 * Nothing reads back from it — if an issue is edited or closed on GitHub,
 * the site does not care and does not sync.
 */

export interface MirrorInput {
  proposalId: string;
  title: string;
  body: string;
  rationale: string;
}

export async function mirrorProposalToGitHub(input: MirrorInput): Promise<void> {
  const repo = process.env.GITHUB_PROPOSAL_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !token) return;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ai-for-people.org";
  const url = `${siteUrl}/propose#${input.proposalId}`;

  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: `Proposed right: ${input.title}`,
      labels: ["proposed-right"],
      body: [
        `**Proposed right**`,
        ``,
        input.body,
        ``,
        `**Why the existing articles don't cover it**`,
        ``,
        input.rationale,
        ``,
        `---`,
        ``,
        `Endorsements are counted on the site, by verified signers, not here:`,
        url,
        ``,
        `_Mirrored automatically. Edits made in this issue are not read back._`,
      ].join("\n"),
    }),
  });

  if (!res.ok) {
    throw new Error(`GitHub issue create failed: ${res.status} ${await res.text()}`);
  }
}
