import type { SafetyLevel } from "@/lib/ai/schemas";
import type { UrgentMessage } from "@/lib/content/schemas";

export interface UrgentBannerProps {
  level: Exclude<SafetyLevel, "clear">;
  /** The static urgent message for this level (content/urgent-messages). Never model text. */
  content: UrgentMessage;
  showDraftLabel: boolean;
  draftLabel: string;
}

/**
 * STUB — placeholder so epic-prepare's result view builds. epic-safety is building the real
 * persistent urgent banner (FR-05, FR-29, v0.3 A2) in parallel; the orchestrator replaces this
 * file with theirs at merge. Do not style or extend this stub.
 */
export function UrgentBanner({ level, content, showDraftLabel, draftLabel }: UrgentBannerProps) {
  return (
    <div
      role="note"
      data-stub="UrgentBanner"
      data-level={level}
      style={{ padding: "var(--space-3) var(--space-4)", border: "2px dashed var(--color-urgent-icon)", borderRadius: "var(--radius-card)", background: "var(--color-urgent-bg)" }}
    >
      {showDraftLabel && <p style={{ fontWeight: 700 }}>{draftLabel}</p>}
      <p>[UrgentBanner stub] {content.banner}</p>
    </div>
  );
}
