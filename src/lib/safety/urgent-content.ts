import type { SafetyLevel, UrgentMessageKey } from "@/lib/ai/schemas";
import type { UrgentMessage, UrgentMessagesFile } from "@/lib/content/schemas";

// Client-safe: no `env` import, no content-file imports. The server builds an `UrgentContent`
// value (getUrgentContent in @/lib/content) and passes it down as a serialisable prop.

export type UrgentMode = "continue_after_ack" | "locked";
export type NonClearLevel = Exclude<SafetyLevel, "clear">;

/** Everything the urgent screen and banner need, for one interface language. Static content only. */
export interface UrgentContent {
  /** URGENT_MODE from server config (v0.3 A2: default continue_after_ack). */
  mode: UrgentMode;
  /** FR-29 / v0.3 A10: on unless SHOW_DRAFT_LABEL=false. */
  showDraftLabel: boolean;
  draftLabel: string;
  /** The language actually served ("en" when the requested language has no file). */
  language: string;
  messages: Record<UrgentMessageKey, UrgentMessage>;
  labels: UrgentMessagesFile["labels"];
}

/**
 * Which static message a gate level shows. `uncertain` uses the `urgent` message
 * (PRD 9.2). `clear` has no message.
 */
export function urgentMessageKeyFor(level: SafetyLevel): UrgentMessageKey | null {
  if (level === "clear") return null;
  if (level === "emergency" || level === "crisis") return level;
  return "urgent";
}

/**
 * The message key to show on an urgent screen. Fails closed: anything that is not emergency or
 * crisis (including `clear` or an unexpected value reaching this screen) shows the urgent message.
 */
export function urgentScreenKey(level: string): UrgentMessageKey {
  return level === "emergency" || level === "crisis" ? level : "urgent";
}

/** The static message for a level, from server-built content. */
export function urgentMessageFor(content: Pick<UrgentContent, "messages">, level: string): UrgentMessage {
  return content.messages[urgentScreenKey(level)];
}

/** "I understand, continue" is offered only in continue_after_ack; any other value behaves as `locked`. */
export function canContinueAfterUrgent(mode: string): boolean {
  return mode === "continue_after_ack";
}
