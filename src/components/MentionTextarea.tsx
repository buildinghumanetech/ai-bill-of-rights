"use client";

import { useEffect, useRef, useState } from "react";

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
}: Props) {
  const internalRef = useRef<HTMLTextAreaElement | null>(null);
  const taRef = externalRef ?? internalRef;
  const [mentionQuery, setMentionQuery] = useState<MentionQuery | null>(null);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const popupRef = useRef<HTMLDivElement | null>(null);

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
  }

  function selectSuggestion(signer: Signer) {
    if (!mentionQuery) return;
    const before = value.slice(0, mentionQuery.atIndex);
    const after = value.slice(mentionQuery.atIndex + 1 + mentionQuery.query.length);
    const newValue = `${before}@${signer.displayName} ${after}`;
    onChange(newValue);
    setMentionQuery(null);

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
