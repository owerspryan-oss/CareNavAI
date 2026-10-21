"use client";

import type { ReactNode } from "react";
import type { AnsweredFollowUp } from "@/lib/prepare/answers";
import type { PrepareState, StepId } from "@/lib/prepare/state";
import { Button } from "@/components/ui/Button";
import { prepareCopy as c } from "./copy";
import styles from "./PrepareFlow.module.css";

export interface ReviewStepProps {
  state: PrepareState;
  onEdit: (step: StepId) => void;
  locked: boolean;
}

/** User text is shown exactly as typed (rendered as text, never HTML). Empty answers say so, never blank. */
function Answer({ text }: { text: string }) {
  const trimmed = text.trim();
  return trimmed ? <p className={styles.userText}>{text}</p> : <p className={styles.skipped}>{c.review.skipped}</p>;
}

function Section({
  heading,
  step,
  onEdit,
  locked,
  children,
}: {
  heading: string;
  step: StepId;
  onEdit: (step: StepId) => void;
  locked: boolean;
  children: ReactNode;
}) {
  return (
    <section className={styles.reviewItem} aria-label={heading}>
      <div className={styles.reviewHeader}>
        <h2 className={styles.reviewHeading}>{heading}</h2>
        <Button
          variant="link"
          className={styles.changeButton}
          onClick={() => onEdit(step)}
          disabled={locked}
          aria-label={`${c.review.change}: ${heading}`}
        >
          {c.review.change}
        </Button>
      </div>
      <div className={styles.reviewBody}>{children}</div>
    </section>
  );
}

function whoText(state: PrepareState): string {
  const { relationship, ageBand } = state.structured;
  if (!relationship) return "";
  if (relationship === "parent") return c.review.childAge(ageBand ? c.who.ageBands[ageBand] : "");
  const base = c.who.options[relationship];
  if (relationship === "self") return base;
  const label = state.text.whoLabel.trim();
  return label ? `${base}: ${label}` : base;
}

export function ReviewStep({ state, onEdit, locked }: ReviewStepProps) {
  const { structured: s, text: t } = state;
  const props = { onEdit, locked };
  return (
    <div className={styles.reviewList}>
      <Section heading={c.review.whoHeading} step="who" {...props}>
        <p className={styles.structuredText}>{whoText(state)}</p>
      </Section>

      <Section heading={c.review.concernHeading} step="concern" {...props}>
        <Answer text={t.concern} />
      </Section>

      <Section heading={c.review.timingHeading} step="timing" {...props}>
        <p className={styles.structuredText}>
          {c.review.startedPrefix} {s.started ? c.timing.started[s.started] : c.review.skipped}
        </p>
        <p className={styles.structuredText}>
          {c.review.patternPrefix} {s.pattern ? c.timing.pattern[s.pattern] : c.review.skipped}
        </p>
        {t.timingNotes.trim() && <p className={styles.userText}>{t.timingNotes}</p>}
      </Section>

      <Section heading={c.review.changesHeading} step="changes" {...props}>
        {t.changes.trim() ? (
          <p className={styles.userText}>{t.changes}</p>
        ) : s.noPatternNoticed ? (
          <p className={styles.structuredText}>{c.review.noPattern}</p>
        ) : (
          <Answer text="" />
        )}
      </Section>

      <Section heading={c.review.medicinesHeading} step="medicines" {...props}>
        <Answer text={t.medicines} />
      </Section>

      <Section heading={c.review.supportHeading} step="medicines" {...props}>
        <Answer text={t.previousSupport} />
      </Section>

      <Section heading={c.review.worriesHeading} step="worries" {...props}>
        <Answer text={t.worries} />
      </Section>
    </div>
  );
}

/** Follow-up answers on review (FR-22 before review): each question shown with the answer as typed. */
export function FollowUpsReview({ followUps, onEdit, locked }: { followUps: AnsweredFollowUp[]; onEdit: () => void; locked: boolean }) {
  if (followUps.length === 0) return null;
  const heading = c.review.followUpsHeading;
  return (
    <div className={styles.reviewList}>
      <section className={styles.reviewItem} aria-label={heading}>
        <div className={styles.reviewHeader}>
          <h2 className={styles.reviewHeading}>{heading}</h2>
          <Button variant="link" className={styles.changeButton} onClick={onEdit} disabled={locked} aria-label={`${c.review.change}: ${heading}`}>
            {c.review.change}
          </Button>
        </div>
        <div className={styles.reviewBody}>
          {followUps.map((f, i) => (
            <div key={i}>
              <p className={styles.structuredText}>{f.question}</p>
              <Answer text={f.answer ?? ""} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
