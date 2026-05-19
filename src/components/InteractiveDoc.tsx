"use client";

import { useEffect, useRef } from "react";
import type { ParsedDocument } from "@/lib/markdown/parse";
import { AnchorSentence } from "./AnchorSentence";

interface Props {
  document: ParsedDocument;
  anchorCounts: Record<string, number>;
}

export function InteractiveDoc({ document, anchorCounts }: Props) {
  const containerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onMouseUp() {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return;
      const text = sel.toString().trim();
      if (!text) return;
      // Find which anchor span contains the selection.
      let node: Node | null = sel.anchorNode;
      while (node && node.nodeType !== 1) node = node.parentNode;
      let anchorId: string | null = null;
      let cursor = node as HTMLElement | null;
      while (cursor) {
        const id = cursor.getAttribute?.("data-anchor-id");
        if (id) {
          anchorId = id;
          break;
        }
        cursor = cursor.parentElement;
      }
      if (!anchorId) return;
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      window.dispatchEvent(
        new CustomEvent("selection-in-anchor", {
          detail: {
            anchorId,
            selectedText: text,
            rect: {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            },
          },
        }),
      );
    }
    el.addEventListener("mouseup", onMouseUp);
    return () => el.removeEventListener("mouseup", onMouseUp);
  }, []);

  return (
    <article ref={containerRef} className="prose prose-zinc max-w-none">
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
