"use client";

import { useId, useState } from "react";
import { FEEDBACK_ANSWERS } from "@/lib/feedback/answers";
import { Button } from "@/components/ui/Button";
import { useResultCopy } from "./copy";
import styles from "./FeedbackPrompt.module.css";

type Answer = (typeof FEEDBACK_ANSWERS)[number];

/**
 * The two anonymous questions after a result (FR-16, AC-16.1). Optional: nothing waits on it. Sends
 * only the flow, the result's language and the two answers (AC-16.2).
 */
export function FeedbackPrompt({ flow, language }: { flow: "prepare" | "understand"; language: string }) {
  const c = useResultCopy().feedback;
  const id = useId();
  const [answers, setAnswers] = useState<{ confident: Answer | null; understandNext: Answer | null }>({ confident: null, understandNext: null });
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  if (state === "sent") {
    return (
      <section className={styles.card} aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`} className={styles.title}>
          {c.title}
        </h2>
        <p role="status" className={styles.thanks}>
          {c.thanks}
        </p>
      </section>
    );
  }

  async function send() {
    setState("sending");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flow, language, ...answers }),
        cache: "no-store",
      });
      setState(res.ok ? "sent" : "failed");
    } catch {
      setState("failed");
    }
  }

  const question = (key: "confident" | "understandNext") => (
    <fieldset className={styles.question}>
      <legend className={styles.statement}>{c[key]}</legend>
      <div className={styles.options}>
        {FEEDBACK_ANSWERS.map((a) => (
          <label key={a} className={styles.option}>
            <input
              type="radio"
              name={`${id}-${key}`}
              value={a}
              checked={answers[key] === a}
              onChange={() => setAnswers((prev) => ({ ...prev, [key]: a }))}
              className={styles.radio}
            />
            <span>{c.answers[a]}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <section className={styles.card} aria-labelledby={`${id}-title`}>
      <div>
        <h2 id={`${id}-title`} className={styles.title}>
          {c.title}
        </h2>
        <p className={styles.lead}>{c.lead}</p>
      </div>
      {question("confident")}
      {question("understandNext")}
      {state === "failed" && (
        <p role="alert" className={styles.failed}>
          {c.failed}
        </p>
      )}
      <Button
        variant="tertiary"
        fullWidth
        onClick={() => void send()}
        disabled={!answers.confident && !answers.understandNext}
        loading={state === "sending"}
        loadingLabel={c.sending}
      >
        {c.send}
      </Button>
    </section>
  );
}
