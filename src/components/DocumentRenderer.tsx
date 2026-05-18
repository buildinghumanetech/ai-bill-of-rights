import type { ParsedDocument } from "@/lib/markdown/parse";

interface Props {
  document: ParsedDocument;
}

export function DocumentRenderer({ document }: Props) {
  return (
    <article className="prose prose-zinc max-w-none dark:prose-invert">
      {document.articles.map((article) => (
        <section key={article.id} id={article.id}>
          {article.id === "preamble" ? (
            <h1>{article.title}</h1>
          ) : (
            <h2>{article.title}</h2>
          )}
          {article.paragraphs.map((paragraph) => (
            <p key={paragraph.id}>
              {paragraph.sentences.map((sentence, idx) => (
                <span
                  key={sentence.id}
                  data-anchor-id={sentence.id}
                  className="anchored-sentence"
                >
                  {idx > 0 ? " " : ""}
                  {sentence.text}
                </span>
              ))}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
