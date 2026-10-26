"use client";

import type { ReactNode } from "react";
import { highlightSegments } from "@/lib/result/view";
import styles from "./Understand.module.css";

export interface LetterTextAreaProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  /** Medicine names, doses and dates to highlight as the person reads and edits (AC-08.3). */
  terms: string[];
  /** MAX_LETTER_CHARS. Shown as a counter, never enforced by truncation. */
  maxChars: number;
  tooLongMessage: (max: number, length: number) => string;
  error?: string;
  readOnly?: boolean;
  /** Slot bottom-right inside the field, reserved for the voice button (FR-07, a later task). */
  accessory?: ReactNode;
}

/**
 * Editable letter text with live highlights (AC-08.3). A mirror layer behind a transparent textarea
 * draws the highlights; the same layer sizes the field to its text, so it grows without scrolling.
 * The mirror is aria-hidden: the found terms are also listed as text under the field.
 */
export function LetterTextArea({
  id,
  label,
  placeholder,
  value,
  onChange,
  terms,
  maxChars,
  tooLongMessage,
  error,
  readOnly,
  accessory,
}: LetterTextAreaProps) {
  const over = value.length > maxChars;
  const message = over ? tooLongMessage(maxChars, value.length) : error;
  const counterId = `${id}-count`;
  const errorId = message ? `${id}-error` : undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        {label}
      </label>
      <div className={styles.box} data-invalid={message ? true : undefined}>
        <div className={styles.grow}>
          <div className={styles.mirror} aria-hidden="true">
            {highlightSegments(value, terms).map((s, i) => (s.mark ? <mark key={i}>{s.text}</mark> : s.text))}
            {/* Keeps a trailing empty line the same height as in the textarea. */}{" "}
          </div>
          <textarea
            id={id}
            className={styles.input}
            rows={8}
            value={value}
            placeholder={placeholder}
            readOnly={readOnly}
            spellCheck={false}
            aria-invalid={message ? true : undefined}
            aria-describedby={[errorId, counterId].filter(Boolean).join(" ")}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        <div className={styles.fieldFooter}>
          <span id={counterId} className={styles.counter} data-over={over || undefined}>
            {value.length.toLocaleString("en-GB")} / {maxChars.toLocaleString("en-GB")}
            <span className="sr-only"> characters</span>
          </span>
          {accessory}
        </div>
      </div>
      {message && (
        <p id={errorId} className={styles.error} role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
