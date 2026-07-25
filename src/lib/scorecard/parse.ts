import matter from "gray-matter";
import { listPrinciples, type Principle } from "./principles";
import {
  NOT_ASSESSED,
  isAssessedStatus,
  isScorecardStatus,
  type Citation,
  type ScorecardAssessment,
  type ScorecardEntry,
} from "./types";

/**
 * Parser + validator for `content/scorecard/<slug>.md`.
 *
 * The rule this file exists to enforce: **a claim about a company without a
 * citation is a hard error.** Not a warning, not a lint — the file fails to
 * parse and the build or the test suite goes red. Every public statement on
 * the scorecard has to trace to a source URL and the date a human checked it,
 * because that traceability is the only thing that makes publishing verdicts
 * about named companies defensible.
 *
 * The corollary: `not-assessed` is the default and carries no prose and no
 * sources. A commitment nobody has looked at renders as "not yet assessed",
 * never as an implied pass or fail.
 */

export class ScorecardValidationError extends Error {
  readonly slug: string;
  readonly errors: string[];

  constructor(slug: string, errors: string[]) {
    super(
      `Invalid scorecard entry "${slug}":\n${errors.map((e) => `  - ${e}`).join("\n")}`,
    );
    this.name = "ScorecardValidationError";
    this.slug = slug;
    this.errors = errors;
  }
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * YAML parses a bare `2026-07-24` into a `Date`, and a quoted one into a
 * string. Accept both, emit ISO `YYYY-MM-DD`, reject anything else.
 */
function normalizeDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!ISO_DATE_RE.test(trimmed)) return null;
  // Guard against `2026-13-45` slipping through the shape check.
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== trimmed) return null;
  return trimmed;
}

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() === "") return false;
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    return false;
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

function optionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseCitation(
  raw: unknown,
  where: string,
  errors: string[],
): Citation | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push(
      `${where}: each citation must be a mapping with "url", "title" and "checkedOn".`,
    );
    return null;
  }
  const c = raw as Record<string, unknown>;
  let ok = true;

  if (!isHttpUrl(c.url)) {
    errors.push(
      `${where}: citation "url" must be an absolute http(s) URL a reader can open (got ${JSON.stringify(c.url ?? null)}).`,
    );
    ok = false;
  }
  const title = optionalString(c.title);
  if (!title) {
    errors.push(
      `${where}: citation "title" is required — name the document you read.`,
    );
    ok = false;
  }
  const checkedOn = normalizeDate(c.checkedOn);
  if (!checkedOn) {
    errors.push(
      `${where}: citation "checkedOn" must be an ISO date (YYYY-MM-DD) recording when a human last opened this source.`,
    );
    ok = false;
  }

  if (!ok) return null;
  return {
    url: (c.url as string).trim(),
    title: title!,
    checkedOn: checkedOn!,
    ...(optionalString(c.quote) ? { quote: optionalString(c.quote)! } : {}),
  };
}

function parseAssessmentRow(
  raw: unknown,
  index: number,
  principlesById: Map<string, Principle>,
  seen: Set<string>,
  errors: string[],
): ScorecardAssessment | null {
  const where = `assessments[${index}]`;

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    errors.push(`${where}: must be a mapping.`);
    return null;
  }
  const row = raw as Record<string, unknown>;

  const principleId = optionalString(row.principle);
  if (!principleId) {
    errors.push(
      `${where}: "principle" is required (e.g. "article-1"), matching an anchor in the Bill of Rights.`,
    );
    return null;
  }
  const principle = principlesById.get(principleId);
  if (!principle) {
    errors.push(
      `${where}: unknown principle "${principleId}". Known ids: ${[...principlesById.keys()].join(", ")}.`,
    );
    return null;
  }
  if (seen.has(principleId)) {
    errors.push(`${where}: duplicate entry for "${principleId}".`);
    return null;
  }
  seen.add(principleId);

  const status = row.status;
  if (!isScorecardStatus(status)) {
    errors.push(
      `${where} (${principleId}): "status" must be one of meets, partial, falls-short, unclear, not-assessed (got ${JSON.stringify(status ?? null)}).`,
    );
    return null;
  }

  const assessment = optionalString(row.assessment);
  const rawCitations = row.citations;

  // --- The unassessed path ------------------------------------------------
  // A commitment nobody has assessed must not carry prose or sources; that is
  // how "not yet assessed" stays honestly empty instead of quietly implying a
  // verdict that was never made.
  if (status === NOT_ASSESSED) {
    const errorsBefore = errors.length;
    if (assessment) {
      errors.push(
        `${where} (${principleId}): status is "not-assessed" but an "assessment" was written. Either give it a real status with citations, or delete the prose.`,
      );
    }
    if (Array.isArray(rawCitations) && rawCitations.length > 0) {
      errors.push(
        `${where} (${principleId}): status is "not-assessed" but citations were supplied. An unassessed commitment makes no claim, so it cites nothing.`,
      );
    }
    if (errors.length > errorsBefore) return null;
    return { principle, status: NOT_ASSESSED, assessment: null, citations: [] };
  }

  // --- The assessed path --------------------------------------------------
  let ok = true;
  if (!assessment) {
    errors.push(
      `${where} (${principleId}): status "${status}" requires an "assessment" saying what was found.`,
    );
    ok = false;
  }

  let citations: Citation[] = [];
  if (!Array.isArray(rawCitations) || rawCitations.length === 0) {
    errors.push(
      `${where} (${principleId}): status "${status}" is a public claim about a company and requires at least one citation (url + title + checkedOn). Uncited claims are rejected.`,
    );
    ok = false;
  } else {
    citations = rawCitations
      .map((c, i) => parseCitation(c, `${where} (${principleId}) citation[${i}]`, errors))
      .filter((c): c is Citation => c !== null);
    if (citations.length !== rawCitations.length) ok = false;
  }

  if (!ok || !isAssessedStatus(status)) return null;
  return { principle, status, assessment: assessment!, citations };
}

/**
 * Parse and validate one scorecard file. Throws `ScorecardValidationError`
 * listing every problem found, rather than failing on the first one — a
 * half-validated entry is worse than no entry.
 */
export function parseScorecardEntry(
  raw: string,
  slug: string,
  principles: Principle[] = listPrinciples(),
): ScorecardEntry {
  const errors: string[] = [];

  let data: Record<string, unknown> = {};
  let body = "";
  try {
    const parsed = matter(raw);
    data = (parsed.data ?? {}) as Record<string, unknown>;
    body = parsed.content ?? "";
  } catch (err) {
    throw new ScorecardValidationError(slug, [
      `Frontmatter is not valid YAML: ${(err as Error).message}`,
    ]);
  }

  if (!SLUG_RE.test(slug)) {
    errors.push(
      `Filename slug "${slug}" must be lowercase kebab-case (a-z, 0-9 and single hyphens).`,
    );
  }
  const declaredSlug = optionalString(data.slug);
  if (declaredSlug && declaredSlug !== slug) {
    errors.push(
      `Frontmatter "slug" (${declaredSlug}) does not match the filename (${slug}).`,
    );
  }

  const company = optionalString(data.company);
  if (!company) {
    errors.push(`"company" is required.`);
  }

  if (typeof data.fictional !== "boolean") {
    errors.push(
      `"fictional" is required and must be true or false. Say plainly whether this entry describes a real organisation; the page labels fictional entries so a demo can never be mistaken for a verdict.`,
    );
  }

  const lastReviewed = normalizeDate(data.lastReviewed);
  if (!lastReviewed) {
    errors.push(
      `"lastReviewed" is required and must be an ISO date (YYYY-MM-DD). The page shows it so readers know how stale this is.`,
    );
  }

  const homepageUrl = data.homepageUrl == null ? null : data.homepageUrl;
  if (homepageUrl !== null && !isHttpUrl(homepageUrl)) {
    errors.push(`"homepageUrl", when present, must be an absolute http(s) URL.`);
  }

  const disputeEmail = optionalString(data.disputeEmail);
  if (disputeEmail && !EMAIL_RE.test(disputeEmail)) {
    errors.push(`"disputeEmail", when present, must look like an email address.`);
  }

  const principlesById = new Map(principles.map((p) => [p.id, p]));
  const byId = new Map<string, ScorecardAssessment>();

  const rawAssessments = data.assessments;
  if (rawAssessments != null) {
    if (!Array.isArray(rawAssessments)) {
      errors.push(`"assessments" must be a list.`);
    } else {
      const seen = new Set<string>();
      rawAssessments.forEach((row, i) => {
        const parsed = parseAssessmentRow(row, i, principlesById, seen, errors);
        if (parsed) byId.set(parsed.principle.id, parsed);
      });
    }
  }

  if (errors.length > 0) throw new ScorecardValidationError(slug, errors);

  // Every commitment gets a row, in document order. Anything the author did
  // not speak to is explicitly unassessed rather than silently absent.
  const assessments: ScorecardAssessment[] = principles.map(
    (principle) =>
      byId.get(principle.id) ?? {
        principle,
        status: NOT_ASSESSED,
        assessment: null,
        citations: [],
      },
  );

  return {
    slug,
    company: company!,
    fictional: data.fictional as boolean,
    oneLiner: optionalString(data.oneLiner),
    homepageUrl: homepageUrl === null ? null : (homepageUrl as string).trim(),
    lastReviewed: lastReviewed!,
    reviewedBy: optionalString(data.reviewedBy),
    disputeEmail,
    notes: body.trim(),
    assessments,
  };
}
