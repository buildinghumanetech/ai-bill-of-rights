import fs from "node:fs";
import path from "node:path";

const RESOURCES_DIR = path.join(process.cwd(), "content", "resources");

export interface Resource {
  slug: string;
  title: string;
  subtitle: string;
  sourceUrl: string;
  body: string;
}

/**
 * Parses a minimal blog-style markdown file with YAML-ish frontmatter:
 *
 *   ---
 *   title: ...
 *   subtitle: ...
 *   sourceUrl: ...
 *   ---
 *
 *   Body paragraphs (markdown).
 */
function parseMd(raw: string, slug: string): Resource {
  const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  let frontmatter = "";
  let body = raw;
  if (fmMatch) {
    frontmatter = fmMatch[1];
    body = fmMatch[2] ?? "";
  }

  const getField = (name: string): string => {
    const re = new RegExp(`^${name}:\\s*(.*)$`, "m");
    const m = frontmatter.match(re);
    return (m ? m[1] : "").trim();
  };

  return {
    slug,
    title: getField("title") || slug,
    subtitle: getField("subtitle"),
    sourceUrl: getField("sourceUrl"),
    body: body.trim(),
  };
}

export function listResourceSlugs(): string[] {
  if (!fs.existsSync(RESOURCES_DIR)) return [];
  return fs
    .readdirSync(RESOURCES_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.replace(/\.md$/, ""));
}

export function getResource(slug: string): Resource | null {
  const file = path.join(RESOURCES_DIR, `${slug}.md`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf-8");
  return parseMd(raw, slug);
}
