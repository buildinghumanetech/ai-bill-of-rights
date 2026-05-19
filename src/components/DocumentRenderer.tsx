import type { ParsedDocument } from "@/lib/markdown/parse";
import { InteractiveDoc } from "./InteractiveDoc";

interface Props {
  document: ParsedDocument;
  /**
   * When true, the doc is rendered as a read-only archive: more structured
   * typography matching the homepage article cards, no anchor decoration.
   * Use for /v/[version] archive pages.
   */
  readOnly?: boolean;
  /**
   * Map of anchorId → comment count, used by InteractiveDoc to show per-sentence badges.
   * Only relevant when readOnly is false.
   */
  anchorCounts?: Record<string, number>;
}

function articleNumber(index: number): string {
  // Preamble is index 0; "Article 01" starts at index 1.
  return String(index).padStart(2, "0");
}

export function DocumentRenderer({ document, anchorCounts = {}, readOnly = false }: Props) {
  if (readOnly) {
    return (
      <article className="mx-auto max-w-3xl">
        {document.articles.map((article, idx) => {
          const isPreamble = article.id === "preamble";
          return (
            <section
              key={article.id}
              id={article.id}
              className={
                isPreamble
                  ? "pb-12 sm:pb-16"
                  : "border-t border-zinc-200 py-16 first:border-t-0 sm:py-20"
              }
            >
              {isPreamble ? (
                <h1 className="text-balance text-4xl font-semibold tracking-tight text-zinc-950 sm:text-5xl">
                  {article.title}
                </h1>
              ) : (
                <div className="flex flex-col gap-6 sm:flex-row sm:gap-12">
                  <div className="shrink-0">
                    <span className="block font-mono text-sm text-zinc-400">
                      Article
                    </span>
                    <span className="block font-mono text-5xl font-light tabular-nums text-zinc-900 sm:text-6xl">
                      {articleNumber(idx)}
                    </span>
                  </div>
                  <div className="flex-1">
                    <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
                      {article.title}
                    </h2>
                    {article.paragraphs.map((paragraph) => (
                      <p
                        key={paragraph.id}
                        className="mt-5 text-lg leading-relaxed text-zinc-700"
                      >
                        {paragraph.sentences.map((s) => s.text).join(" ")}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {isPreamble
                ? article.paragraphs.map((paragraph) => (
                    <p
                      key={paragraph.id}
                      className="mt-5 text-lg leading-relaxed text-zinc-700"
                    >
                      {paragraph.sentences.map((s) => s.text).join(" ")}
                    </p>
                  ))
                : null}
            </section>
          );
        })}
      </article>
    );
  }

  return <InteractiveDoc document={document} anchorCounts={anchorCounts} />;
}
