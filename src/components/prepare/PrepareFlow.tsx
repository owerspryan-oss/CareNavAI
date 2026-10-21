"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { GateResult, SafetyLevel } from "@/lib/ai/schemas";
import { mostCautious, screenText } from "@/lib/client/screen";
import {
  REVIEW_INDEX,
  STEP_IDS,
  currentStep,
  effectiveAgeBand,
  initialPrepareState,
  isSkippable,
  prepareReducer,
  unscreenedFields,
  validateStep,
  type PrepareAction,
  type PrepareState,
  type StepErrors,
  type StepId,
  type StructuredAnswers,
  type TextField,
} from "@/lib/prepare/state";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { ProgressStepper } from "@/components/ui/ProgressStepper";
import { TopBar } from "@/components/ui/TopBar";
import { UrgentGate } from "@/components/safety/UrgentGate";
import type { UrgentContent } from "@/lib/safety/urgent-content";
import { prepareCopy as c } from "./copy";
import { ReviewStep } from "./ReviewStep";
import {
  ChangesStep,
  ConcernStep,
  MedicinesStep,
  TimingStep,
  WhoStep,
  WorriesStep,
  type StepBodyProps,
} from "./StepBodies";
import styles from "./PrepareFlow.module.css";

export interface PrepareFlowProps {
  /** MAX_TEXT_CHARS from server config (AC-06.1), passed down so it isn't hard-coded on the client. */
  maxChars: number;
  /** Static urgent-message content and URGENT_MODE, built on the server (getUrgentContent). */
  urgentContent: UrgentContent;
}

type Direction = "forward" | "back";

const BODIES: Record<Exclude<StepId, "review">, (p: StepBodyProps) => ReactNode> = {
  who: WhoStep,
  concern: ConcernStep,
  timing: TimingStep,
  changes: ChangesStep,
  medicines: MedicinesStep,
  worries: WorriesStep,
};

type PendingGate = { result: GateResult; level: Exclude<SafetyLevel, "clear">; screened: Partial<Record<TextField, string>> };

/** First step (in journey order) whose answers fail validation, across the whole journey. */
function firstInvalidStep(state: PrepareState, maxChars: number): { step: StepId; errors: StepErrors } | null {
  for (const step of STEP_IDS) {
    const errors = validateStep(state, step, maxChars, c.errors);
    if (Object.keys(errors).length > 0) return { step, errors };
  }
  return null;
}

/**
 * Journey 1 guided steps (FR-21): who → concern → timing → changes → medicines → worries → review.
 * All answers live in React state only (guest = stateless). Every free-text answer is screened by the
 * urgency gate before the journey moves on; anything but `clear` hands over to <UrgentGate>.
 */
export function PrepareFlow({ maxChars, urgentContent }: PrepareFlowProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(prepareReducer, undefined, initialPrepareState);
  const [errors, setErrors] = useState<StepErrors>({});
  const [screening, setScreening] = useState(false);
  const [gate, setGate] = useState<PendingGate | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const transitionToken = useRef(0);
  const firstRender = useRef(true);

  const step = currentStep(state);
  const total = STEP_IDS.length;

  // Move focus to the new step's heading so screen readers announce it (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (gate) return;
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [state.stepIndex, gate]);

  /** Step change with a symmetric horizontal slide (DESIGN_SYSTEM.md §8), via the View Transitions API. */
  const navigate = useCallback((action: PrepareAction, direction: Direction) => {
    setErrors({});
    const apply = () => dispatch(action);
    if (typeof document.startViewTransition !== "function") {
      apply();
      return;
    }
    const root = document.documentElement;
    const token = ++transitionToken.current;
    root.dataset.stepDirection = direction;
    const transition = document.startViewTransition(() => flushSync(apply));
    transition.finished.finally(() => {
      if (transitionToken.current === token) delete root.dataset.stepDirection;
    });
  }, []);

  /** Drop the errors for fields the user just changed (over-limit text is re-checked live by TextArea). */
  const clearErrors = useCallback((keys: string[]) => {
    setErrors((prev) => {
      if (!keys.some((k) => k in prev)) return prev;
      const next = { ...prev };
      for (const k of keys) delete next[k as keyof StepErrors];
      return next;
    });
  }, []);
  const setText = useCallback(
    (field: TextField, value: string) => {
      dispatch({ type: "setText", field, value });
      // Typing in "changes" also satisfies its requirement, as does ticking "no pattern" below.
      clearErrors([field]);
    },
    [clearErrors],
  );
  const setStructured = useCallback(
    (patch: Partial<StructuredAnswers>) => {
      dispatch({ type: "setStructured", patch });
      clearErrors(patch.noPatternNoticed ? [...Object.keys(patch), "changes"] : Object.keys(patch));
    },
    [clearErrors],
  );

  /**
   * Screen every free-text answer that hasn't passed the gate in its current form (not just this
   * step's: text edited and left via Back is caught here too). Fails closed via screenText.
   * Over-limit text is left for its own step's validation rather than sent to the gate.
   */
  async function screenPending(): Promise<{ clear: boolean; screened: Partial<Record<TextField, string>> }> {
    const fields = unscreenedFields(state).filter((f) => state.text[f].length <= maxChars);
    const screened = Object.fromEntries(fields.map((f) => [f, state.text[f]])) as Partial<Record<TextField, string>>;
    if (fields.length === 0) return { clear: true, screened };

    setScreening(true);
    const ageBand = effectiveAgeBand(state);
    const results = await Promise.all(fields.map((f) => screenText(state.text[f], "step_text", ageBand)));
    setScreening(false);

    const worst = mostCautious(results);
    if (worst) {
      setGate({ result: worst, level: worst.level as Exclude<SafetyLevel, "clear">, screened });
      return { clear: false, screened };
    }
    return { clear: true, screened };
  }

  async function onNext() {
    if (screening) return;
    const stepErrors = validateStep(state, step, maxChars, c.errors);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      return;
    }
    const { clear, screened } = await screenPending();
    if (clear) navigate({ type: "advance", screened }, "forward");
  }

  async function onGetSummary() {
    if (screening) return;
    const invalid = firstInvalidStep(state, maxChars);
    if (invalid) {
      navigate({ type: "editFromReview", step: invalid.step }, "back");
      setErrors(invalid.errors);
      return;
    }
    const { clear, screened } = await screenPending();
    if (!clear) return;
    dispatch({ type: "advance", screened });
    // TODO(T-11/T-13): POST the answers to /api/summary (which re-screens the combined input) and show the result.
  }

  function onBack() {
    if (screening) return;
    if (state.stepIndex === 0) {
      router.push("/");
      return;
    }
    navigate({ type: "back" }, "back");
  }

  if (gate) {
    return (
      <UrgentGate
        result={gate.result}
        content={urgentContent}
        onStartAgain={() => {
          dispatch({ type: "reset" });
          setErrors({});
          setGate(null);
        }}
        onAcknowledge={() => {
          dispatch({ type: "advanceAfterUrgent", screened: gate.screened, level: gate.level });
          setGate(null);
        }}
      />
    );
  }

  const copy = c.steps[step];
  const isReview = step === "review";
  const Body = isReview ? null : BODIES[step];
  const primaryLabel = isReview
    ? c.review.getSummary
    : isSkippable(state, step)
      ? c.actions.skip
      : state.returnToReview
        ? c.actions.saveAndReview
        : c.actions.next;

  return (
    <div className={styles.page}>
      <TopBar
        backLabel={state.stepIndex === 0 ? c.actions.backToStart : c.actions.back}
        onBack={onBack}
        backDisabled={screening}
      />
      <main className={styles.main}>
        <ProgressStepper current={state.stepIndex + 1} total={total} label={c.stepLabel(state.stepIndex + 1, total)} />
        <Banner tone="info">{c.draftNotice}</Banner>

        <form
          id="prepare-step"
          className={`${styles.step} guided-step`}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void (isReview ? onGetSummary() : onNext());
          }}
        >
          <div className={styles.intro}>
            <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
              {copy.title}
            </h1>
            <p className={styles.lead}>{copy.lead}</p>
          </div>
          {Body ? (
            <Body
              state={state}
              errors={errors}
              maxChars={maxChars}
              locked={screening}
              setText={setText}
              setStructured={setStructured}
            />
          ) : (
            <ReviewStep
              state={state}
              locked={screening}
              onEdit={(target) => navigate({ type: "editFromReview", step: target }, "back")}
            />
          )}
        </form>
      </main>

      <footer className={styles.footer}>
        <Button variant="tertiary" className={styles.backButton} onClick={onBack} disabled={screening}>
          {state.stepIndex === 0 ? c.actions.backToStart : c.actions.back}
        </Button>
        <Button
          type="submit"
          form="prepare-step"
          variant="primary"
          loading={screening}
          loadingLabel={c.actions.checking}
          trailingChevron={state.stepIndex < REVIEW_INDEX && !isSkippable(state, step)}
        >
          {primaryLabel}
        </Button>
      </footer>
    </div>
  );
}
