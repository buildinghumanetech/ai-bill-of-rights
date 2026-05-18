import matter from "gray-matter";

export interface Sentence {
  id: string;
  text: string;
}

export interface Paragraph {
  id: string;
  sentences: Sentence[];
}

export interface Article {
  id: string;
  title: string;
  paragraphs: Paragraph[];
}

export interface ParsedDocument {
  frontmatter: Record<string, unknown>;
  articles: Article[];
}

// Matches `{#some-id}` at the end of headings or sentences.
const ANCHOR_RE = /\{#([a-z0-9-]+)\}/g;

function paragraphToSentences(
  paragraph: string,
  paragraphIndex: number,
  articleId: string,
): Paragraph {
  const sentences: Sentence[] = [];
  let buffer = "";
  let lastIdx = 0;

  for (const match of paragraph.matchAll(ANCHOR_RE)) {
    const chunk = paragraph.slice(lastIdx, match.index!);
    buffer += chunk;
    sentences.push({
      id: match[1],
      text: buffer.trim(),
    });
    buffer = "";
    lastIdx = match.index! + match[0].length;
  }
  const trailing = paragraph.slice(lastIdx).trim();
  // If there is dangling text past the last anchor, attach it to the previous sentence
  // (sentences without anchors are not addressable, so this avoids losing content).
  if (trailing && sentences.length > 0) {
    sentences[sentences.length - 1].text =
      `${sentences[sentences.length - 1].text} ${trailing}`.trim();
  } else if (trailing) {
    sentences.push({
      id: `${articleId}-p-${paragraphIndex}-unanchored`,
      text: trailing,
    });
  }
  return {
    id: `${articleId}-p-${paragraphIndex}`,
    sentences,
  };
}

export function parseDocument(raw: string): ParsedDocument {
  const { data, content } = matter(raw);
  const articles: Article[] = [];

  const lines = content.split("\n");
  let currentArticle: Article | null = null;
  let paragraphBuffer = "";
  let paragraphIndex = 0;

  const flushParagraph = () => {
    if (!currentArticle) return;
    const trimmed = paragraphBuffer.trim();
    if (trimmed.length === 0) return;
    currentArticle.paragraphs.push(
      paragraphToSentences(trimmed, paragraphIndex++, currentArticle.id),
    );
    paragraphBuffer = "";
  };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+?)\s*\{#([a-z0-9-]+)\}\s*$/);
    if (headingMatch) {
      flushParagraph();
      const titleRaw = headingMatch[2];
      const id = headingMatch[3];
      currentArticle = { id, title: titleRaw.trim(), paragraphs: [] };
      articles.push(currentArticle);
      paragraphIndex = 0;
    } else if (line.trim() === "") {
      flushParagraph();
    } else {
      paragraphBuffer += `${paragraphBuffer ? " " : ""}${line.trim()}`;
    }
  }
  flushParagraph();

  return { frontmatter: data, articles };
}
