"use client";

import { useEffect, useRef } from "react";
import type { GateResult } from "@/lib/ai/schemas";

export interface UrgentGateProps {
  /** A non-clear gate result. Carries only enums (level, message key, categories), never user or model text. */
  result: GateResult;
  /** Discard the journey and start again. Always offered. */
  onStartAgain: () => void;
  /**
   * Continue after "I understand" (URGENT_MODE=continue_after_ack, v0.3 A2). Wired by the caller now;
   * the safety epic decides when to offer it. This stub never does (it behaves as `locked`).
   */
  onAcknowledge: () => void;
}

/**
 * PLACEHOLDER — owned by epic-safety (FR-05, FR-24, FR-29), which replaces this file with the static,
 * pre-approved urgent message, the DRAFT label and the acknowledgement flow.
 * Rules for whoever replaces it: static content files only, never model text; nothing AI-generated in this view.
 */
export function UrgentGate({ result, onStartAgain }: UrgentGateProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  return (
    <main
      style={{
        maxWidth: "32rem",
        margin: "0 auto",
        padding: "var(--space-6) var(--space-4)",
        display: "grid",
        gap: "var(--space-4)",
      }}
    >
      <h1 ref={headingRef} tabIndex={-1} style={{ fontSize: "var(--text-title-size)" }}>
        Safety check placeholder
      </h1>
      <p>
        The urgency gate returned <strong>{result.level}</strong>. The safety epic owns this screen and will
        replace this placeholder with the approved urgent message.
      </p>
      <button
        type="button"
        onClick={onStartAgain}
        style={{
          minHeight: "2.75rem",
          border: 0,
          background: "transparent",
          color: "var(--color-teal-500)",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Start again
      </button>
    </main>
  );
}
