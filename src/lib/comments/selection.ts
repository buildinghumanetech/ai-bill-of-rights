/**
 * Shared vocabulary for turning a text selection into a comment. The two event
 * names live here rather than in either component because they are a contract
 * *between* them, not part of one's API.
 */

/** Dispatched by `<ArticleSelectionContainer>` when a commentable selection settles. */
export const SELECTION_EVENT = "selection-in-anchor";

/** Dispatched by `<CommentsColumn>` whenever the composer is dismissed. */
export const COMPOSER_CLOSED_EVENT = "selection-composer-closed";

export interface AnchoredSelection {
  anchorId: string;
  selectedText: string;
}

export interface SelectionStep {
  /** Dispatch a selection event for this observation. */
  emit: boolean;
  /** The `last` value to carry into the next observation. */
  last: AnchoredSelection | null;
}

/**
 * Advance the container's dedupe state by one observation.
 *
 * `observed` is `null` whenever the current selection can't become a comment —
 * collapsed, whitespace-only, or outside any anchored sentence. That case
 * *resets* `last`, which is the whole point of routing every path through here:
 * an early `return` that left a stale `last` behind would make the guard
 * permanently sticky, so re-selecting the same phrase after dismissing the
 * composer would silently do nothing.
 *
 * A repeat of the same anchor+text is suppressed. That is what keeps the two
 * signals feeding the container — `mouseup` and a debounced `selectionchange`,
 * both of which fire for one desktop gesture — from remounting an in-progress
 * composer and discarding what the user had typed.
 */
export function nextSelectionState(
  last: AnchoredSelection | null,
  observed: AnchoredSelection | null,
): SelectionStep {
  if (!observed || !observed.selectedText.trim()) {
    return { emit: false, last: null };
  }
  if (last && last.anchorId === observed.anchorId && last.selectedText === observed.selectedText) {
    return { emit: false, last };
  }
  return { emit: true, last: observed };
}

export interface ScrollDecisionInput {
  /** Viewport rect of the *composer itself*, not its container. */
  composerRect: { top: number; bottom: number };
  viewportHeight: number;
}

/**
 * How much of the composer must be on screen to count as "the user can see it",
 * as a ratio of however much of it *could possibly* be shown —
 * `min(its height, the viewport)`.
 *
 * A ratio rather than a pixel constant so it can't drift as the composer's
 * contents change. Clamped to the viewport because a composer taller than 2x
 * the viewport can never reach this threshold against its own height (`visible`
 * maxes out at the viewport), so every emit would re-scroll forever — reachable
 * on a landscape phone, or on Android where the keyboard shrinks `innerHeight`
 * under an expanded textarea.
 */
const MIN_VISIBLE_FRACTION = 0.5;

/**
 * Does the whole composer fit on screen?
 *
 * Both rules below turn on this one question, and they have to keep agreeing:
 * the clamp is what makes a tall composer's visible ratio saturate at 1, and
 * `"start"` alignment is what makes that saturated state a *usable* resting
 * position instead of a stuck one. Written twice, in two shapes, they could
 * drift — the obvious way being an `innerHeight` adjustment for the Android
 * keyboard inset applied at only one site, which would restore exactly the
 * stuck-at-the-bottom state, with both functions' tests still green because each
 * pins its own half in isolation.
 */
function fitsInViewport({ composerRect, viewportHeight }: ScrollDecisionInput): boolean {
  return composerRect.bottom - composerRect.top <= viewportHeight;
}

/**
 * Should the page pull the comments column into view for this selection?
 *
 * One rule: scroll when the user can't actually see the composer. It applies at
 * every width — "you can't see the box you're about to type into" is worth
 * fixing on a short desktop window too, and keying it to visibility rather than
 * a breakpoint is what stops it drifting out of sync with the grid.
 *
 * Measure the composer, not its column: the column's top edge can sit just
 * inside the viewport while the composer, which starts ~50px lower, is entirely
 * below the fold.
 *
 * (The superseded anchor gate, and why smooth scroll outlasting the selection
 * debounce is benign, are recorded in the branch log rather than here.)
 */
export function shouldScrollComposerIntoView(input: ScrollDecisionInput): boolean {
  const { composerRect, viewportHeight } = input;
  const height = composerRect.bottom - composerRect.top;
  // Degenerate boxes: nothing meaningful is on screen, and the clamped
  // denominator below would be 0, making the comparison NaN. Bail explicitly
  // rather than letting `NaN < 0.5` decide (it is false — the wrong way round).
  if (height <= 0 || viewportHeight <= 0) return true;
  const visible =
    Math.min(composerRect.bottom, viewportHeight) - Math.max(composerRect.top, 0);
  // See MIN_VISIBLE_FRACTION for why the denominator is clamped to the viewport.
  const showable = fitsInViewport(input) ? height : viewportHeight;
  return visible / showable < MIN_VISIBLE_FRACTION;
}

/**
 * Where to align the composer once we've decided to scroll.
 *
 * `"center"` is right for anything that fits, but on a composer taller than the
 * viewport it centers the *middle* — pushing the quote block and the top of the
 * textarea above the fold. The visibility rule above then measures a full
 * viewport of composer, calls it visible, and declines to correct it, so the
 * user is parked at the bottom of a box they need to type into the top of. That
 * resting state only became reachable once the denominator was clamped.
 *
 * So: align to the top when it can't all fit. The top is where the user types.
 */
export function composerScrollBlock(input: ScrollDecisionInput): "start" | "center" {
  return fitsInViewport(input) ? "center" : "start";
}
