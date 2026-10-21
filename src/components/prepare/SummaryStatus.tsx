"use client";

import { useEffect, useRef } from "react";
import type { CallError } from "@/lib/client/prepare";
import { Button } from "@/components/ui/Button";
import { TopBar } from "@/components/ui/TopBar";
import { prepareCopy as c } from "./copy";
import styles from "./PrepareFlow.module.css";

export type SummaryStatusProps =
  | { kind: "loading" }
  | { kind: "error"; error: CallError; onRetry: () => void; onBackToAnswers: () => void };

/** "Making your summary" and the friendly, static error states (413 / 503 / 502 or network). */
export function SummaryStatus(props: SummaryStatusProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [props.kind]);

  const s = c.summaryStatus;
  if (props.kind === "loading") {
    return (
      <div className={styles.page}>
        <TopBar backLabel={c.actions.back} onBack={() => {}} backDisabled />
        <main className={styles.main}>
          <div className={styles.status} role="status" aria-live="polite">
            <span className={styles.statusSpinner} aria-hidden="true" />
            <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
              {s.makingTitle}
            </h1>
            <p className={styles.lead}>{s.makingLead}</p>
          </div>
        </main>
      </div>
    );
  }

  const copy = s.errors[props.error];
  // Retrying won't shorten text: "too long" only offers the way back to the answers.
  const canRetry = props.error !== "too_long";
  return (
    <div className={styles.page}>
      <TopBar backLabel={s.backToAnswers} onBack={props.onBackToAnswers} />
      <main className={styles.main}>
        <div className={styles.status} role="alert">
          <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
            {copy.title}
          </h1>
          <p className={styles.lead}>{copy.body}</p>
          <div className={styles.statusActions}>
            {canRetry && (
              <Button variant="primary" fullWidth onClick={props.onRetry}>
                {s.tryAgain}
              </Button>
            )}
            <Button variant={canRetry ? "link" : "primary"} fullWidth onClick={props.onBackToAnswers}>
              {s.backToAnswers}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
