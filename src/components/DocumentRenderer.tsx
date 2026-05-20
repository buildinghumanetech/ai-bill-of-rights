import type { ParsedDocument } from "@/lib/markdown/parse";

interface Props {
  document: ParsedDocument;
  /**
   * Kept for API back-compat — the renderer is always read-only now that the
   * interactive variant has moved to the homepage's `<HomepageArticles>` flow.
   */
  readOnly?: boolean;
}

function articleNumber(index: number): string {
  // Preamble is index 0; "Article 01" starts at index 1.
  return String(index).padStart(2, "0");
}

export function DocumentRenderer({ document }: Props) {
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
