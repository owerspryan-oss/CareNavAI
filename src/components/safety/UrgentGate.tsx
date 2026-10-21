"use client";

import { useEffect, useId, useRef } from "react";
import type { GateResult } from "@/lib/ai/schemas";
import { canContinueAfterUrgent, urgentMessageFor, type UrgentContent } from "@/lib/safety/urgent-content";
import { Button } from "@/components/ui/Button";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { DraftLabel } from "./DraftLabel";
import { UrgentActions } from "./UrgentActions";
import styles from "./UrgentGate.module.css";

export interface UrgentGateProps {
  /** A non-clear gate result. Only `result.level` is read; it carries no user or model text. */
  result: GateResult;
  /** Static, server-built content for the interface language (getUrgentContent in @/lib/content). */
  content: UrgentContent;
  /** Discard the journey and start again. Always offered. */
  onStartAgain: () => void;
  /** Continue after "I understand". Offered only when content.mode is continue_after_ack (v0.3 A2). */
  onAcknowledge: () => void;
}

/**
 * The urgent-message screen (FR-05, FR-24, FR-29). Shows ONLY the static, pre-approved message for the
 * gate level: no user text and no AI-generated text, ever (CLAUDE.md rule 3). `uncertain` (and anything
 * unexpected) shows the urgent message. The DRAFT label is on unless config switches it off.
 */
export function UrgentGate({ result, content, onStartAgain, onAcknowledge }: UrgentGateProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const bodyId = useId();
  const message = urgentMessageFor(content, result.level);
  const canContinue = canContinueAfterUrgent(content.mode);

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
        <p className={styles.wordmark}>CareNav AI</p>
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
          </div>
        </div>

        <UrgentActions actions={message.actions} className={styles.actions} />

        <div className={styles.secondary}>
          {canContinue && (
            <Button variant="tertiary" fullWidth trailingChevron onClick={onAcknowledge} data-action="acknowledge">
              {content.labels.acknowledge}
            </Button>
          )}
          <Button variant="link" onClick={onStartAgain} data-action="start-again">
            {content.labels.startAgain}
          </Button>
        </div>
      </main>
    </div>
  );
}
