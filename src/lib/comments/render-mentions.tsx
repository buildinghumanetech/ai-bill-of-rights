import type { ReactNode } from "react";
import { parseMentions } from "./mentions";

/**
 * Renders a comment body as an array of React nodes, with @mentions styled as
 * highlighted spans. Safe for React rendering — no dangerouslySetInnerHTML.
 */
export function renderBodyWithMentions(
  body: string,
  knownSigners: { id: string; displayName: string }[],
): ReactNode[] {
  if (knownSigners.length === 0) return [body];

  const mentions = parseMentions(body, knownSigners);
  if (mentions.length === 0) return [body];

  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const mention of mentions) {
    if (cursor < mention.matchStart) {
      nodes.push(body.slice(cursor, mention.matchStart));
    }
    nodes.push(
      <span
        key={`${mention.signerId}-${mention.matchStart}`}
        className="rounded bg-blue-50 px-1 text-blue-700"
      >
        {/* Render what the author typed, not the canonical display name —
            matching is case-insensitive and accepts first names, so echoing
            `displayName` here would silently rewrite their comment. */}
        {body.slice(mention.matchStart, mention.matchEnd)}
      </span>,
    );
    cursor = mention.matchEnd;
  }

  if (cursor < body.length) {
    nodes.push(body.slice(cursor));
  }

  return nodes;
}
