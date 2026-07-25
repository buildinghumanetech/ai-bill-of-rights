"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  pruneResolvedMentions,
  type ResolvedMention,
} from "@/lib/comments/resolved-mentions";

interface Signer {
  id: string;
  displayName: string;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  signers: Signer[];
  rows?: number;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /**
   * Called with the signers the author has explicitly picked from the typeahead
   * and whose inserted text is still in the body. The parent submits these ids
   * so the server notifies exactly these people — see
   * `src/lib/comments/resolved-mentions.ts` for why resolution happens here and
   * not by re-reading the prose later.
   */
  onResolvedMentionsChange?: (mentions: ResolvedMention[]) => void;
}

interface MentionQuery {
  /** Index of the `@` character that triggered this query. */
  atIndex: number;
  /** The partial text typed after `@`, e.g. "Dan" while typing "@Daniel Odio". */
  query: string;
}

const MAX_SUGGESTIONS = 6;

/**
 * A drop-in textarea replacement that shows an @mention typeahead popup.
 *
 * When the user types `@` we capture that position and filter the signers list
 * by prefix (case-insensitive) as they continue typing. Selecting a suggestion
 * replaces the `@partial` in the textarea with `@DisplayName ` (trailing space
 * so they can keep typing).
 *
 * The popup is anchored below the textarea — simple v1, no per-caret positioning.
 * Keyboard: arrow-up / arrow-down navigate, Enter / Tab select, Escape dismiss.
 *
 * Selecting a suggestion also **keeps the signer's id** and reports it through
 * `onResolvedMentionsChange`, which is what the server notifies on. Typing a name
 * by hand notifies nobody, by design — the "Notifying …" line under the textarea
 * shows the author exactly who will be emailed so that is never a surprise.
 */
export function MentionTextarea({
  value,
  onChange,
  signers,
  rows = 4,
  placeholder,
  autoFocus,
  className,
  textareaRef: externalRef,
  onResolvedMentionsChange,
}: Props) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const taRef = externalRef ?? internalRef;
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const popupRef = useRef<HTMLDivElement | null>(null);
  /** Signers explicitly picked from the typeahead, in pick order. */
  const [picked, setPicked] = useState<ResolvedMention[]>([]);

  // Compute filtered suggestions
  const suggestions = mentionQuery
    ? signers
        .filter((s) =>
          s.displayName.toLowerCase().startsWith(mentionQuery.query.toLowerCase()),
        )
        .slice(0, MAX_SUGGESTIONS)
    : [];

  // Reset selected index when the suggestion list changes
  useEffect(() => {
    setSelectedIdx(0);
  }, [suggestions.length, mentionQuery?.query]);

  // Derive the live set during render rather than syncing it in an effect: the
  // answer is a pure function of the current body and the picks so far, so there
  // is no state to keep in step. This also covers the parent clearing `value`
  // after a successful submit — nothing is left to notify.
  const live = pruneResolvedMentions(value, picked);
  // Signer ids are uuids, so joining on a comma yields a unique key per set.
  const resolvedKey = live.map((m) => m.signerId).join(",");
  // Hold the array identity stable for as long as the *set* is unchanged, so the
  // notify effect below fires on a real change and not on every keystroke.
  const resolved = useMemo(() => live, [resolvedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // The callback is read through a ref so an inline arrow prop can't retrigger
  // the effect (parent setState -> new callback identity -> effect -> setState).
  const notifyRef = useRef(onResolvedMentionsChange);
  useEffect(() => {
    notifyRef.current = onResolvedMentionsChange;
  });
  useEffect(() => {
    notifyRef.current?.(resolved);
  }, [resolved]);

  function detectMentionQuery(text: string, caretPos: number): MentionQuery | null {
    // Walk backwards from caret to find the last `@` that has no space between it and the caret
    const before = text.slice(0, caretPos);
    const lastAt = before.lastIndexOf("@");
    if (lastAt === -1) return null;
    const afterAt = before.slice(lastAt + 1);
    // If there's a space in afterAt, the user has moved past the mention context
    if (afterAt.includes(" ")) return null;
    return { atIndex: lastAt, query: afterAt };
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const newValue = e.target.value;
    onChange(newValue);
    const caret = e.target.selectionStart ?? newValue.length;
    const q = detectMentionQuery(newValue, caret);
    setMentionQuery(q);
    // Forget picks the author has edited away, so deleting a mention and then
    // retyping the same name by hand does not silently re-arm the notification.
    setPicked((prev) => pruneResolvedMentions(newValue, prev));
  }

  function selectSuggestion(signer: Signer) {
    if (!mentionQuery) return;
    const before = value.slice(0, mentionQuery.atIndex);
    const after = value.slice(mentionQuery.atIndex + 1 + mentionQuery.query.length);
    const newValue = `${before}@${signer.displayName} ${after}`;
    onChange(newValue);
    setMentionQuery(null);
    // Record the resolved id at the moment of the pick. This is the whole point:
    // we know exactly who was meant here, and never have to guess it back out of
    // the text afterwards.
    setPicked((prev) =>
      pruneResolvedMentions(newValue, [
        ...prev,
        { signerId: signer.id, displayName: signer.displayName },
      ]),
    );

    // Restore focus and place caret after the inserted mention
    const ta = taRef.current;
    if (ta) {
      const newCaret = before.length + 1 + signer.displayName.length + 1; // +1 for @, +1 for trailing space
      ta.focus();
      requestAnimationFrame(() => {
        ta.selectionStart = newCaret;
        ta.selectionEnd = newCaret;
      });
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mentionQuery || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" || e.key === "Tab") {
      const s = suggestions[selectedIdx];
      if (s) {
        e.preventDefault();
        selectSuggestion(s);
      }
    } else if (e.key === "Escape") {
      setMentionQuery(null);
    }
  }

  const showPopup = mentionQuery !== null && suggestions.length > 0;

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        autoFocus={autoFocus}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={rows}
        placeholder={placeholder}
        className={
          className ??
          "w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        }
      />
      {/* Who this comment will actually notify. Only an explicit pick from the
          typeahead notifies anyone, so without this line an author who typed a
          name by hand would get silence with no way to tell.

          Shown only when a parent is listening for the resolution — a composer
          that ignores it (the inline edit form, which sends no mail) must not
          promise a notification it won't deliver. */}
      {onResolvedMentionsChange !== undefined && resolved.length > 0 && (
        <p
          data-testid="mention-notify-list"
          className="mt-1 text-xs text-zinc-500"
        >
          Notifying{" "}
          {resolved.map((m, idx) => (
            <span key={m.signerId}>
              {idx > 0 ? ", " : ""}
              <span className="font-medium text-zinc-700">@{m.displayName}</span>
            </span>
          ))}
        </p>
      )}
      {showPopup && (
        <div
          ref={popupRef}
          role="listbox"
          aria-label="Mention suggestions"
          className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-zinc-200 bg-white shadow-lg"
        >
          {suggestions.map((s, idx) => (
            <button
              key={s.id}
              role="option"
              aria-selected={idx === selectedIdx}
              type="button"
              onMouseDown={(e) => {
                // Use onMouseDown + preventDefault so the textarea doesn't lose focus
                e.preventDefault();
                selectSuggestion(s);
              }}
              className={`w-full px-3 py-1.5 text-left text-sm transition-colors ${
                idx === selectedIdx
                  ? "bg-blue-50 text-blue-900"
                  : "text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              @{s.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
