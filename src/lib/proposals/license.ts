/**
 * The licence a proposed right is submitted under.
 *
 * WHY THIS EXISTS. A proposal is someone else's writing, and an accepted one is
 * spliced into a published version of the document. Without a grant its
 * copyright stays with its author and nothing permits republishing it. The
 * notice in ProposeRightForm is where the grant is given; the `license` and
 * `license_granted_at` columns on `proposed_edits` are where it is recorded,
 * per row, because the page's wording can change and a row has to carry the
 * terms it was actually submitted under.
 *
 * The form posts `id` back and the server refuses anything else. That ties the
 * recorded grant to a client that rendered this notice: a stale tab or a direct
 * POST from before the notice existed cannot file a row stamped with terms its
 * author never saw.
 *
 * If this ever changes, keep the old id meaningful — rows already recorded
 * under it do not change terms because the constant did.
 */
export const PROPOSAL_LICENSE = {
  id: "CC-BY-4.0",
  name: "Creative Commons Attribution 4.0 International",
  shortName: "CC BY 4.0",
  url: "https://creativecommons.org/licenses/by/4.0/",
} as const;

/** The form field the licence id travels in. */
export const LICENSE_FIELD = "license";
