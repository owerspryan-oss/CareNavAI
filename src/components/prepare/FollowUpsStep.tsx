"use client";

import { useEffect, useRef, useState } from "react";
import type { FollowUpQuestion } from "@/lib/client/prepare";
import type { AnsweredFollowUp } from "@/lib/prepare/answers";
import { Button } from "@/components/ui/Button";
import { TextArea } from "@/components/ui/TextArea";
import { TopBar } from "@/components/ui/TopBar";
import { prepareCopy as c } from "./copy";
import styles from "./PrepareFlow.module.css";

export interface FollowUpsStepProps {
  /** Up to 3 server-validated, clarity-only questions (FR-22, AC-22.3, AC-22.4). Rendered as text only. */
  questions: FollowUpQuestion[];
  /** Earlier answers when coming back from review to change them; empty on the first pass. */
  initial?: AnsweredFollowUp[];
  maxChars: number;
  /** True while the answers are being screened or the summary is starting. Fields go read-only. */
  busy: boolean;
  /** Called with every question; skipped or empty answers are `null` (AC-22.2). The caller screens them. */
  onContinue: (answers: AnsweredFollowUp[]) => void;
  onBack: () => void;
}

/** Journey 1 step 7, before review: dynamic follow-up questions. Each can be answered or skipped. */
export function FollowUpsStep({ questions, initial = [], maxChars, busy, onContinue, onBack }: FollowUpsStepProps) {
  const [values, setValues] = useState<string[]>(() => questions.map((_, i) => initial[i]?.answer ?? ""));
  const [skipped, setSkipped] = useState<boolean[]>(() => questions.map((_, i) => initial.length > 0 && initial[i]?.answer === null));
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const tooLong = values.some((v, i) => !skipped[i] && v.length > maxChars);

  function submit() {
    if (busy || tooLong) return;
    onContinue(
      questions.map((q, i) => ({
        intent: q.intent,
        question: q.question,
        answer: skipped[i] || values[i].trim() === "" ? null : values[i],
      })),
    );
  }

  const setAt = <T,>(list: T[], i: number, v: T) => list.map((x, j) => (j === i ? v : x));

  return (
    <div className={styles.page}>
      <TopBar backLabel={c.actions.back} onBack={onBack} backDisabled={busy} />
      <main className={styles.main}>
        <form
          id="prepare-followups"
          className={styles.step}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className={styles.intro}>
            <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
              {c.followUps.title}
            </h1>
            <p className={styles.lead}>{c.followUps.lead}</p>
          </div>

          <ol className={styles.followUpList}>
            {questions.map((q, i) => (
              <li key={`${q.intent}-${i}`} className={styles.followUpItem}>
                {skipped[i] ? (
                  <>
                    <p className={styles.followUpQuestion} id={`followup-q-${i}`}>
                      {q.question}
                    </p>
                    <div className={styles.followUpRow}>
                      <span className={styles.skipped}>{c.followUps.skipped}</span>
                      <Button
                        variant="link"
                        className={styles.changeButton}
                        disabled={busy}
                        onClick={() => setSkipped(setAt(skipped, i, false))}
                        aria-describedby={`followup-q-${i}`}
                      >
                        {c.followUps.undoSkip}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <TextArea
                      id={`followup-${i}`}
                      label={q.question}
                      placeholder={c.followUps.placeholder}
                      rows={3}
                      value={values[i]}
                      onChange={(v) => setValues(setAt(values, i, v))}
                      maxChars={maxChars}
                      tooLongMessage={c.errors.tooLong}
                      readOnly={busy}
                    />
                    <div className={styles.followUpRow} data-align="end">
                      <Button
                        variant="link"
                        className={styles.changeButton}
                        disabled={busy}
                        onClick={() => setSkipped(setAt(skipped, i, true))}
                        aria-label={`${c.followUps.skip}: ${q.question}`}
                      >
                        {c.followUps.skip}
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ol>
        </form>
      </main>

      <footer className={styles.footer}>
        <Button variant="tertiary" className={styles.backButton} onClick={onBack} disabled={busy}>
          {c.actions.back}
        </Button>
        <Button
          type="submit"
          form="prepare-followups"
          variant="primary"
          loading={busy}
          loadingLabel={c.actions.checking}
          disabled={tooLong}
          trailingChevron
        >
          {c.followUps.continue}
        </Button>
      </footer>
    </div>
  );
}
