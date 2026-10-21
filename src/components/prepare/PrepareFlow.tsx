"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { GateResult, SafetyLevel } from "@/lib/ai/schemas";
import { fetchFollowUps, fetchSummary, type CallError, type FollowUpQuestion, type SummaryResult } from "@/lib/client/prepare";
import { mostCautious, screenText } from "@/lib/client/screen";
import { toPrepareAnswers, type AnsweredFollowUp } from "@/lib/prepare/answers";
import {
  REVIEW_INDEX,
  STEP_IDS,
  currentStep,
  effectiveAgeBand,
  fieldMax,
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
import { ResultView } from "@/components/result/ResultView";
import type { LanguageNames } from "@/lib/result/view";
import type { UrgentContent } from "@/lib/safety/urgent-content";
import { prepareCopy as c } from "./copy";
import { FollowUpsStep } from "./FollowUpsStep";
import { ownWords } from "./ownWords";
import { FollowUpsReview, ReviewStep } from "./ReviewStep";
import { SummaryStatus } from "./SummaryStatus";
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
  /** Language names and direction from config/languages.json, for the result view (T-13). */
  languages: LanguageNames;
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

/** What to carry on with after an urgent message raised by a follow-up or summary call is acknowledged. */
type Resume = { to: "followups" } | { to: "review"; followUps: AnsweredFollowUp[] } | { to: "summary"; followUps: AnsweredFollowUp[] };

type PendingGate = {
  result: GateResult;
  level: Exclude<SafetyLevel, "clear">;
  screened: Partial<Record<TextField, string>>;
  resume?: Resume;
};

/** `steps` = the guided steps and review; follow-ups sit between the last step and review (FR-22). */
type Stage =
  | { name: "steps" }
  | { name: "followups"; questions: FollowUpQuestion[]; initial: AnsweredFollowUp[]; busy: boolean }
  | { name: "loading" }
  | { name: "error"; error: CallError; followUps: AnsweredFollowUp[] }
  | { name: "result"; result: SummaryResult; followUps: AnsweredFollowUp[] };

/** A gate result that stopped the journey. A `clear` here would be a server bug: route it up anyway. */
function urgentLevel(g: GateResult): Exclude<SafetyLevel, "clear"> {
  return g.level === "clear" ? "uncertain" : g.level;
}

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
export function PrepareFlow({ maxChars, urgentContent, languages }: PrepareFlowProps) {
  const router = useRouter();
  const [state, dispatch] = useReducer(prepareReducer, undefined, initialPrepareState);
  const [errors, setErrors] = useState<StepErrors>({});
  const [screening, setScreening] = useState(false);
  const [gate, setGate] = useState<PendingGate | null>(null);
  const [stage, setStage] = useState<Stage>({ name: "steps" });
  /** Answered follow-ups, shown and editable on review. Asked once, after the last guided step. */
  const [followUps, setFollowUps] = useState<AnsweredFollowUp[]>([]);
  const [followUpsAsked, setFollowUpsAsked] = useState(false);
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
  }, [state.stepIndex, gate, stage.name]);

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
    const fields = unscreenedFields(state).filter((f) => state.text[f].length <= fieldMax(f, maxChars));
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
    if (!clear) return;
    navigate({ type: "advance", screened }, "forward");
    if (leadsToFollowUps()) await startFollowUps(state.urgentAcknowledged !== null);
  }

  /** The last guided step, on the first pass (not when editing from review), opens the follow-ups. */
  function leadsToFollowUps(): boolean {
    return state.stepIndex === REVIEW_INDEX - 1 && !state.returnToReview && !followUpsAsked;
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
    await requestSummary(followUps, state.urgentAcknowledged !== null);
  }

  /** Step 7 (FR-22): ask for follow-ups before review. None, or any failure, goes straight to review. */
  async function startFollowUps(acknowledged: boolean) {
    setFollowUpsAsked(true);
    setScreening(true);
    const out = await fetchFollowUps(toPrepareAnswers(state), acknowledged);
    setScreening(false);
    if (out.kind === "urgent") {
      setGate({ result: out.gate, level: urgentLevel(out.gate), screened: {}, resume: { to: "followups" } });
    } else if (out.kind === "followups" && out.questions.length > 0) {
      setStage({ name: "followups", questions: out.questions, initial: [], busy: false });
    }
  }

  function editFollowUps() {
    const questions = followUps.map(({ intent, question }) => ({ intent, question }));
    setStage({ name: "followups", questions, initial: followUps, busy: false });
  }

  /** Every follow-up answer passes the gate before the journey continues (AC-22.5). */
  async function submitFollowUps(answered: AnsweredFollowUp[]) {
    if (stage.name !== "followups" || stage.busy) return;
    setStage({ ...stage, busy: true });
    const ageBand = effectiveAgeBand(state);
    const answers = answered.map((f) => f.answer).filter((a): a is string => a !== null);
    const worst = mostCautious(await Promise.all(answers.map((a) => screenText(a, "followup_answer", ageBand))));
    if (worst) {
      setStage({ ...stage, busy: false });
      setGate({ result: worst, level: urgentLevel(worst), screened: {}, resume: { to: "review", followUps: answered } });
      return;
    }
    setFollowUps(answered);
    setStage({ name: "steps" });
  }

  /** Steps 8-9: the summary call (the server re-screens the combined input first). */
  async function requestSummary(followUps: AnsweredFollowUp[], acknowledged: boolean) {
    setStage({ name: "loading" });
    const out = await fetchSummary(toPrepareAnswers(state, followUps), acknowledged);
    if (out.kind === "urgent") {
      setGate({ result: out.gate, level: urgentLevel(out.gate), screened: {}, resume: { to: "summary", followUps } });
    } else if (out.kind === "error") {
      setStage({ name: "error", error: out.error, followUps });
    } else {
      setStage({ name: "result", result: out, followUps });
    }
  }

  function backToReview() {
    setErrors({});
    setStage({ name: "steps" });
  }

  function onUrgentAcknowledged(pending: PendingGate) {
    setGate(null);
    if (!pending.resume) {
      const toFollowUps = leadsToFollowUps();
      dispatch({ type: "advanceAfterUrgent", screened: pending.screened, level: pending.level });
      if (toFollowUps) void startFollowUps(true);
      return;
    }
    dispatch({ type: "acknowledgeUrgent", level: pending.level });
    if (pending.resume.to === "followups") void startFollowUps(true);
    else if (pending.resume.to === "review") {
      setFollowUps(pending.resume.followUps);
      setStage({ name: "steps" });
    } else void requestSummary(pending.resume.followUps, true);
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
          setStage({ name: "steps" });
          setFollowUps([]);
          setFollowUpsAsked(false);
        }}
        onAcknowledge={() => onUrgentAcknowledged(gate)}
      />
    );
  }

  if (stage.name === "followups") {
    return (
      <FollowUpsStep
        questions={stage.questions}
        initial={stage.initial}
        maxChars={maxChars}
        busy={stage.busy}
        onContinue={(answers) => void submitFollowUps(answers)}
        onBack={() => {
          // From review ("Change"): back to review. First pass: back to the last guided step.
          if (stage.initial.length === 0) navigate({ type: "back" }, "back");
          setStage({ name: "steps" });
        }}
      />
    );
  }
  if (stage.name === "loading") return <SummaryStatus kind="loading" />;
  if (stage.name === "error") {
    return (
      <SummaryStatus
        kind="error"
        error={stage.error}
        onRetry={() => void requestSummary(stage.followUps, state.urgentAcknowledged !== null)}
        onBackToAnswers={backToReview}
      />
    );
  }
  if (stage.name === "result") {
    return (
      <ResultView
        result={stage.result}
        ownWords={ownWords(state, stage.followUps)}
        urgentContent={urgentContent}
        languages={languages}
        onNotQuite={backToReview}
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
            <>
              <ReviewStep
                state={state}
                locked={screening}
                onEdit={(target) => navigate({ type: "editFromReview", step: target }, "back")}
              />
              <FollowUpsReview followUps={followUps} locked={screening} onEdit={editFollowUps} />
            </>
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
