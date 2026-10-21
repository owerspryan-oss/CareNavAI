"use client";

import type { ReactNode } from "react";
import styles from "./TextArea.module.css";

export interface TextAreaProps {
  id: string;
  label: string;
  /** Visually hide the label when a visible heading already says the same thing. */
  labelHidden?: boolean;
  hint?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  /** AC-06.1: configured maximum, shown as a counter. Never enforced by truncation (AC-06.2). */
  maxChars: number;
  /** Friendly message shown when the text is over `maxChars`. */
  tooLongMessage: (max: number, length: number) => string;
  /** Validation error from the last submit (e.g. "Please write something"). */
  error?: string;
  rows?: number;
  readOnly?: boolean;
  /** Slot anchored bottom-right inside the field, reserved for the voice button (FR-07). */
  accessory?: ReactNode;
}

/** Surface card text field with a character counter (DESIGN_SYSTEM.md §7, FR-06). */
export function TextArea({
  id,
  label,
  labelHidden,
  hint,
  placeholder,
  value,
  onChange,
  maxChars,
  tooLongMessage,
  error,
  rows = 5,
  readOnly,
  accessory,
}: TextAreaProps) {
  const over = value.length > maxChars;
  // Inline validation: the over-limit message appears as soon as it applies, not only on submit.
  const message = over ? tooLongMessage(maxChars, value.length) : error;
  const hintId = hint ? `${id}-hint` : undefined;
  const counterId = `${id}-count`;
  const errorId = message ? `${id}-error` : undefined;

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={labelHidden ? "sr-only" : styles.label}>
        {label}
      </label>
      {hint && (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      )}
      <div className={styles.box} data-invalid={message ? true : undefined}>
        <textarea
          id={id}
          className={styles.input}
          rows={rows}
          // field-sizing: content ignores rows, so rows sets the starting height instead.
          style={{ minHeight: `calc(${rows} * 1lh + var(--space-4) + var(--space-2))` }}
          value={value}
          placeholder={placeholder}
          readOnly={readOnly}
          aria-invalid={message ? true : undefined}
          aria-describedby={[hintId, errorId, counterId].filter(Boolean).join(" ")}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className={styles.footer}>
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
