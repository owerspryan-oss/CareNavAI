"use client";

import { useEffect, useState } from "react";
import { useUi } from "@/components/i18n/UiProvider";
import { PROGRESS_INTERVAL_MS, runSequence, type ProgressCopy } from "./progress";
import styles from "./ProgressFeed.module.css";

export interface ProgressFeedProps {
  /** Static lines in order (common.progress). The feed stops on the last one. Give it a new `key` for a new sequence. */
  lines: string[];
  intervalMs?: number;
  className?: string;
}

/**
 * One short status line at a time while the app waits, like a "working" indicator: a gentle
 * cross-fade and slide between lines and a soft shimmer on the current one (neither under reduced
 * motion: the text just changes). Screen readers hear the first line once, not every change.
 */
export function ProgressFeed({ lines, intervalMs = PROGRESS_INTERVAL_MS, className }: ProgressFeedProps) {
  const [index, setIndex] = useState(0);
  const [announced, setAnnounced] = useState("");
  const first = lines[0] ?? "";

  useEffect(() => runSequence(lines.length, intervalMs, setIndex), [lines.length, intervalMs]);
  // Filled just after mount, so a live region that arrives with the feed still announces it.
  useEffect(() => {
    const id = setTimeout(() => setAnnounced(first), 100);
    return () => clearTimeout(id);
  }, [first]);

  const current = Math.min(index, lines.length - 1);
  return (
    <div className={[styles.feed, className].filter(Boolean).join(" ")} data-progress-feed="">
      <p className="sr-only" aria-live="polite">
        {announced}
      </p>
      <p className={styles.lines} aria-hidden="true">
        {current > 0 && (
          <span key={current - 1} className={`${styles.line} ${styles.leaving}`}>
            {lines[current - 1]}
          </span>
        )}
        <span key={current} className={`${styles.line} ${styles.current}`} data-index={current}>
          {lines[current]}
        </span>
      </p>
    </div>
  );
}

/** The progress lines in the current interface language. */
export function useProgressCopy(): ProgressCopy {
  return useUi().messages.common.progress;
}
