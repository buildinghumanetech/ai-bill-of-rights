import type { ParsedDocument } from "@/lib/markdown/parse";
import { AnchorSentence } from "./AnchorSentence";

interface Props {
  document: ParsedDocument;
  anchorCounts?: Record<string, number>;
}

export function DocumentRenderer({ document, anchorCounts = {} }: Props) {
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
                <AnchorSentence
                  key={sentence.id}
                  anchorId={sentence.id}
                  count={anchorCounts[sentence.id] ?? 0}
                >
                  {idx > 0 ? " " : ""}
                  {sentence.text}
                </AnchorSentence>
              ))}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}
