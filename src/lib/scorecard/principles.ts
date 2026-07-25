import fs from "node:fs";
import path from "node:path";
import { parseDocument } from "@/lib/markdown/parse";

/**
 * The scorecard grades companies against the nine commitments in the AI Bill
 * of Rights. Rather than re-typing those commitments here (and letting the two
 * drift), we derive them from the published document itself: the same markdown
 * that `/v/<version>` renders. If the Bill gains a tenth article, the scorecard
 * grows a tenth row for free.
 */

const BOR_DIR = path.join(process.cwd(), "content", "bill-of-rights");

export interface Principle {
  /** Anchor id from the Bill of Rights markdown, e.g. `article-1`. */
  id: string;
  /** 1-based position, parsed out of `Article N:` when present. */
  number: number;
  /** Title with the `Article N:` prefix stripped. */
  title: string;
  /** Full heading text as authored. */
  headingText: string;
}

function readCurrentVersion(): string {
  const file = path.join(BOR_DIR, "versions.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as {
    current?: string;
  };
  if (!raw.current) {
    throw new Error(`content/bill-of-rights/versions.json has no "current"`);
  }
  return raw.current;
}

let cached: Principle[] | null = null;

/**
 * The commitments a scorecard entry may be assessed against, in document
 * order. The preamble is not a commitment and is excluded.
 */
export function listPrinciples(): Principle[] {
  if (cached) return cached;

  const version = readCurrentVersion();
  const docPath = path.join(BOR_DIR, `v${version}.md`);
  const parsed = parseDocument(fs.readFileSync(docPath, "utf-8"));

  const principles = parsed.articles
    .filter((a) => a.id !== "preamble")
    .map((a, i) => {
      const m = a.title.match(/^Article\s+(\d+)\s*:\s*(.+)$/i);
      return {
        id: a.id,
        number: m ? parseInt(m[1], 10) : i + 1,
        title: m ? m[2].trim() : a.title,
        headingText: a.title,
      };
    });

  if (principles.length === 0) {
    throw new Error(
      `No articles found in content/bill-of-rights/v${version}.md — the scorecard has nothing to grade against.`,
    );
  }

  cached = principles;
  return principles;
}

export function isKnownPrincipleId(id: string): boolean {
  return listPrinciples().some((p) => p.id === id);
}

export function getPrinciple(id: string): Principle | null {
  return listPrinciples().find((p) => p.id === id) ?? null;
}

/** Test seam — drops the memoised principle list. */
export function __resetPrincipleCache(): void {
  cached = null;
}
