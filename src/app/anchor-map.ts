import { articles, splitSentences } from "./HomepageArticles";

/**
 * Every comment anchor the homepage can emit, mapped to the text it renders.
 *
 * WHY THIS EXISTS. A comment stores an anchor id, not the words it was written
 * about. Change the words in that slot and the comment silently re-attaches to
 * whatever is there now: nothing errors, nothing renders red, and the person
 * appears to have replied to a sentence they never read. `article-04-s-1`
 * changed under two live comments in the v0.0.1 -> v0.1.0 publish and the only
 * reason it was safe is that "persuasive dark patterns" -> "deceptive
 * patterns" means the same thing. That was luck, checked after the fact.
 *
 * THERE ARE FIVE ANCHOR KINDS, and the count is the point. Migration 0010 and
 * the README both reasoned about two of them (sentences and pills) and missed
 * the rest, so Article 6's pull quote could change from `Every AI agent has a
 * "license plate" identifier...` to "The loop stays open." — an entirely
 * different claim under a stable anchor — with nothing to catch it. No comment
 * happened to be sitting there. Next time is a coin flip.
 *
 * The mapping below mirrors HomepageArticles.tsx: `:523` (title), `:544`
 * (sentences, over `splitSentences(article.body)`), `:564` (pull quote, only
 * when non-null), `:583` (the "Connects to" label), `:609` (pills). Keep them
 * in step — this file is the drift test's only notion of what exists.
 *
 * NOTE ON SENTENCE NUMBERING. `-s-N` indexes `splitSentences(article.body)`,
 * NOT the canonical markdown's `{#article-N-s-M}` ids. They disagree: the
 * markdown counts the pull quote as a body sentence, so Article 7's closing
 * line is `s-5` there and `article-07-pullquote` here. Migration 0010 was
 * written against the markdown's numbering and its `article-07-s-5` remap
 * therefore matched zero rows. Derive from this file, never from the markdown.
 */
export function anchorTextMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const article of articles) {
    const n = article.number;
    map[`article-${n}-title`] = article.title;
    splitSentences(article.body).forEach((sentence, i) => {
      map[`article-${n}-s-${i + 1}`] = sentence;
    });
    if (article.pullQuote) {
      map[`article-${n}-pullquote`] = article.pullQuote;
    }
    if (article.connects && article.connects.length > 0) {
      map[`article-${n}-connects-label`] = "Connects to";
      for (const pill of article.connects) {
        map[`article-${n}-connect-${pill.slug}`] = pill.title;
      }
    }
  }
  return map;
}
