import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SAFETY_LEVELS } from "@/lib/ai/schemas";
import { getUrgentContent, getUrgentMessage } from "@/lib/content";
import {
  canContinueAfterUrgent,
  selfHarmExtras,
  urgentMessageFor,
  urgentMessageKeyFor,
  urgentScreenKey,
} from "@/lib/safety/urgent-content";

describe("urgent-content client helpers", () => {
  it("maps uncertain to the urgent message and keeps emergency/crisis", () => {
    expect(urgentScreenKey("uncertain")).toBe("urgent");
    expect(urgentScreenKey("urgent")).toBe("urgent");
    expect(urgentScreenKey("emergency")).toBe("emergency");
    expect(urgentScreenKey("crisis")).toBe("crisis");
  });

  it("fails closed: clear or an unexpected level on the urgent screen shows the urgent message", () => {
    expect(urgentScreenKey("clear")).toBe("urgent");
    expect(urgentScreenKey("not-a-level")).toBe("urgent");
    expect(urgentScreenKey("")).toBe("urgent");
  });

  it("agrees with urgentMessageKeyFor for every non-clear level", () => {
    for (const level of SAFETY_LEVELS) {
      if (level === "clear") expect(urgentMessageKeyFor(level)).toBeNull();
      else expect(urgentScreenKey(level)).toBe(urgentMessageKeyFor(level));
    }
  });

  it("offers continue only in continue_after_ack; anything else behaves as locked", () => {
    expect(canContinueAfterUrgent("continue_after_ack")).toBe(true);
    expect(canContinueAfterUrgent("locked")).toBe(false);
    expect(canContinueAfterUrgent("")).toBe(false);
    expect(canContinueAfterUrgent("CONTINUE_AFTER_ACK")).toBe(false);
  });

  it("adds the Samaritans line and call only to an emergency that also has self-harm", () => {
    const content = { messages: { emergency: getUrgentMessage("emergency", "en").message, urgent: getUrgentMessage("urgent", "en").message, crisis: getUrgentMessage("crisis", "en").message } };
    const extras = selfHarmExtras(content, { level: "emergency", categories: ["self_harm_or_suicide"] });
    expect(extras?.line).toContain("116 123");
    expect(extras?.action).toMatchObject({ id: "call_samaritans", href: "tel:116123" });
    expect(selfHarmExtras(content, { level: "emergency", categories: ["chest_pain"] })).toBeNull();
    expect(selfHarmExtras(content, { level: "crisis", categories: ["self_harm_or_suicide"] })).toBeNull();
    expect(selfHarmExtras(content, { level: "urgent", categories: ["self_harm_or_suicide"] })).toBeNull();
  });

  it("the client-safe module never imports server config", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/safety/urgent-content.ts"), "utf8");
    expect(src).not.toMatch(/config\/env/);
    expect(src).not.toMatch(/^import (?!type )/m);
  });
});

describe("getUrgentContent (server builder)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("carries the static English messages, labels and draft label, and is serialisable", () => {
    const c = getUrgentContent("en");
    expect(c.language).toBe("en");
    expect(c.draftLabel).toBe("DRAFT, NOT CLINICALLY APPROVED");
    expect(c.labels).toEqual(getUrgentMessage("urgent", "en").labels);
    for (const key of ["emergency", "urgent", "crisis"] as const) {
      expect(c.messages[key]).toEqual(getUrgentMessage(key, "en").message);
    }
    expect(JSON.parse(JSON.stringify(c))).toEqual(c);
  });

  it("resolves the same message the server would for each level", () => {
    const c = getUrgentContent("en");
    for (const level of ["emergency", "urgent", "crisis", "uncertain"] as const) {
      expect(urgentMessageFor(c, level)).toEqual(getUrgentMessage(level, "en").message);
    }
  });

  it("defaults to continue_after_ack with the draft label on", () => {
    const d = getUrgentContent("en");
    expect(d.mode).toBe("continue_after_ack");
    expect(d.showDraftLabel).toBe(true);
  });

  it("follows config only: URGENT_MODE=locked, SHOW_DRAFT_LABEL=false", async () => {
    vi.stubEnv("URGENT_MODE", "locked");
    vi.stubEnv("SHOW_DRAFT_LABEL", "false");
    vi.resetModules();
    const fresh = await import("@/lib/content");
    const l = fresh.getUrgentContent("en");
    expect(l.mode).toBe("locked");
    expect(l.showDraftLabel).toBe(false);
  });

  it("falls back to English for a language without a file", () => {
    expect(getUrgentContent("zz").language).toBe("en");
  });
});
