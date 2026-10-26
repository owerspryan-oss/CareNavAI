"use client";

import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import styles from "./SegmentedControl.module.css";

export interface SegmentedControlProps<T extends string> {
  /** Accessible name for the tab list. */
  label: string;
  /** Prefix for tab ids; the panel the tabs control must have id `${idPrefix}-panel`. */
  idPrefix: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Pill-shaped two-way switch with a sliding thumb (DESIGN_SYSTEM.md §7, §8): the thumb is
 * width-matched to the active label and slides on the default spring, never cross-fades.
 * Tabs semantics with arrow-key navigation.
 */
export function SegmentedControl<T extends string>({ label, idPrefix, options, value, onChange }: SegmentedControlProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLSpanElement>(null);

  // Position the thumb under the active tab. Written straight to the DOM (no re-render), and
  // re-measured when the labels resize (text size, translation).
  useLayoutEffect(() => {
    const list = listRef.current;
    const thumb = thumbRef.current;
    if (!list || !thumb) return;
    const place = () => {
      const active = list.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!active) return;
      thumb.style.width = `${active.offsetWidth}px`;
      thumb.style.transform = `translateX(${active.offsetLeft}px)`;
    };
    place();
    // First placement must not animate in from the left.
    requestAnimationFrame(() => thumb.setAttribute("data-ready", ""));
    const ro = new ResizeObserver(place);
    ro.observe(list);
    return () => ro.disconnect();
  }, [value]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = options.findIndex((o) => o.value === value);
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const target = e.key === "Home" ? 0 : e.key === "End" ? options.length - 1 : step ? (i + step + options.length) % options.length : -1;
    if (target < 0) return;
    e.preventDefault();
    onChange(options[target].value);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[target]?.focus();
  }

  return (
    <div ref={listRef} role="tablist" aria-label={label} className={styles.list} onKeyDown={onKeyDown}>
      <span ref={thumbRef} className={styles.thumb} aria-hidden="true" />
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${o.value}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
