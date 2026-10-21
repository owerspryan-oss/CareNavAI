"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { GateResult } from "@/lib/ai/schemas";
import type { UrgentMessage } from "@/lib/content/schemas";
import { canContinueAfterUrgent, selfHarmExtras, urgentMessageFor, type UrgentContent } from "@/lib/safety/urgent-content";
import { Button } from "@/components/ui/Button";
import { LanguagePicker } from "@/components/i18n/LanguagePicker";
import { Checkbox } from "@/components/ui/Checkbox";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { DraftLabel } from "./DraftLabel";
import { UrgentActions } from "./UrgentActions";
import styles from "./UrgentGate.module.css";

export interface UrgentGateProps {
  /** A non-clear gate result. Only `level` and `categories` are read; it carries no user or model text. */
  result: GateResult;
  /** Static, server-built content for the interface language (getUrgentContent in @/lib/content). */
  content: UrgentContent;
  /** Discard the journey and start again. Always offered. */
  onStartAgain: () => void;
  /** Continue after "I understand". Offered only when content.mode is continue_after_ack (v0.3 A2). */
  onAcknowledge: () => void;
  /**
   * AC-05.9: the person's own source text (e.g. a "From your letter" card), shown after the static
   * message and its actions, outside the message block. Never AI-generated text (CLAUDE.md rule 3).
   */
  sourceText?: ReactNode;
}

/**
 * The urgent-message screen (FR-05, FR-24, FR-29). Shows ONLY the static, pre-approved message for the
 * gate level: no user text and no AI-generated text, ever (CLAUDE.md rule 3). `uncertain` (and anything
 * unexpected) shows the urgent message. The DRAFT label is on unless config switches it off.
 */
export function UrgentGate({ result, content, onStartAgain, onAcknowledge, sourceText }: UrgentGateProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const message = urgentMessageFor(content, result.level);
  const canContinue = canContinueAfterUrgent(content.mode);
  const selfHarm = selfHarmExtras(content, result);
  const actions = selfHarm?.action ? [...message.actions, selfHarm.action] : message.actions;
  // Self-harm makes continuing as deliberate as on the crisis screen, even when the level is emergency.
  const continueCheck = message.continueCheck ?? (selfHarm ? content.messages.crisis.continueCheck : undefined);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      className={styles.page}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      data-level={result.level}
      data-mode={content.mode}
    >
      <header className={styles.header}>
        <span aria-hidden="true" />
        <p className={styles.wordmark}>CareNav AI</p>
        <div className={styles.headerEnd}>
          <LanguagePicker />
        </div>
      </header>
      {content.showDraftLabel && <DraftLabel text={content.draftLabel} />}

      <main className={styles.main} lang={content.language}>
        <div className={styles.message}>
          <span className={styles.badge}>
            <AlertTriangleIcon className={styles.badgeIcon} />
          </span>
          <h1 id={titleId} ref={headingRef} tabIndex={-1} className={styles.title}>
            {message.title}
          </h1>
          <div id={bodyId} className={styles.body}>
            {message.body.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
            {selfHarm && <p data-self-harm-line>{selfHarm.line}</p>}
          </div>
        </div>

        <UrgentActions actions={actions} className={styles.actions} />

        {sourceText}

        <div className={styles.secondary}>
          {canContinue &&
            (continueCheck ? (
              <ContinueCheck check={continueCheck} onAcknowledge={onAcknowledge} />
            ) : (
              <Button variant="tertiary" fullWidth trailingChevron onClick={onAcknowledge} data-action="acknowledge">
                {content.labels.acknowledge}
              </Button>
            ))}
          <Button variant="link" onClick={onStartAgain} data-action="start-again">
            {content.labels.startAgain}
          </Button>
        </div>
      </main>
    </div>
  );
}

/**
 * Crisis, or emergency with self-harm: continuing takes two deliberate steps instead of one tap
 * (product owner, 2026-10-21).
 * A quiet link opens a short static check; its button stays off until the person ticks that they are
 * not in danger. Static content only, like the rest of this screen.
 */
function ContinueCheck({ check, onAcknowledge }: { check: NonNullable<UrgentMessage["continueCheck"]>; onAcknowledge: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const checkboxId = useId();

  useEffect(() => {
    if (open) titleRef.current?.focus();
  }, [open]);

  if (!open) {
    return (
      <Button variant="link" onClick={() => setOpen(true)} data-action="open-continue-check">
        {check.link}
      </Button>
    );
  }

  return (
    <section className={styles.continueCheck} aria-labelledby={titleId} data-continue-check>
      <h2 id={titleId} ref={titleRef} tabIndex={-1} className={styles.continueTitle}>
        {check.title}
      </h2>
      {check.body.map((line, i) => (
        <p key={i}>{line}</p>
      ))}
      <Checkbox id={checkboxId} label={check.confirm} checked={confirmed} onChange={setConfirmed} />
      <Button variant="tertiary" fullWidth trailingChevron disabled={!confirmed} onClick={onAcknowledge} data-action="acknowledge">
        {check.button}
      </Button>
    </section>
  );
}
