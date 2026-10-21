import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchFollowUps, fetchSummary, urgentGate } from "@/lib/client/prepare";
import type { PrepareAnswers } from "@/lib/ai/schemas";
import fixture from "../fixtures/marcia-summary.json";

const answers: PrepareAnswers = {
  forWhom: { relationship: "self", label: null, ageBand: null },
  mainConcern: "my knees hurt",
  timing: { started: null, pattern: null, note: null },
  changes: null,
  medicines: null,
  worries: null,
  followUps: [],
};

const gate = { level: "urgent", messageKey: "urgent", categories: ["other"], language: "en", register: "standard", failedLayers: [] };

function mockFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => vi.unstubAllGlobals());

describe("fetchSummary", () => {
  it("posts answers, acknowledgement and output language, and returns a valid result", async () => {
    const f = mockFetch(async () => json(fixture));
    const out = await fetchSummary(answers, true);
    expect(out.kind).toBe("result");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/summary");
    expect(JSON.parse(String(init.body))).toEqual({ answers, acknowledgedUrgent: true, outputLanguage: null });
  });

  it("returns the gate on an urgent response", async () => {
    mockFetch(async () => json({ kind: "urgent", gate }));
    await expect(fetchSummary(answers, false)).resolves.toEqual({ kind: "urgent", gate });
  });

  it("fails closed: a malformed or 'clear' gate inside an urgent response routes up as uncertain", async () => {
    mockFetch(async () => json({ kind: "urgent", gate: { level: "nope" } }));
    const out = await fetchSummary(answers, false);
    expect(out.kind === "urgent" && out.gate.level).toBe("uncertain");
    expect(urgentGate({ ...gate, level: "clear" }).level).toBe("uncertain");
    expect(urgentGate(undefined).level).toBe("uncertain");
  });

  it.each([
    [413, "too_long"],
    [503, "busy"],
    [502, "failed"],
    [500, "failed"],
    [400, "failed"],
  ])("maps HTTP %i to a %s error", async (status, error) => {
    mockFetch(async () => json({ error: "x" }, status));
    await expect(fetchSummary(answers, false)).resolves.toEqual({ kind: "error", error });
  });

  it("treats a network error or a malformed result as failed, never as a result", async () => {
    mockFetch(async () => {
      throw new TypeError("network");
    });
    await expect(fetchSummary(answers, false)).resolves.toEqual({ kind: "error", error: "failed" });

    mockFetch(async () => json({ ...fixture, english: { ...fixture.english, meta: undefined } }));
    await expect(fetchSummary(answers, false)).resolves.toEqual({ kind: "error", error: "failed" });
  });

  it("accepts a result with no user version", async () => {
    mockFetch(async () => json({ ...fixture, user: null, userFallback: "parity" }));
    const out = await fetchSummary(answers, false);
    expect(out.kind === "result" && out.user).toBeNull();
  });
});

describe("fetchFollowUps", () => {
  it("posts the prepare journey and returns the questions", async () => {
    const questions = [{ intent: "clarify_medicines", question: "How often do you take paracetamol?" }];
    const f = mockFetch(async () => json({ kind: "followups", questions }));
    await expect(fetchFollowUps(answers, false)).resolves.toEqual({ kind: "followups", questions });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/followups");
    expect(JSON.parse(String(init.body))).toEqual({ journey: "prepare", answers, acknowledgedUrgent: false });
  });

  it("rejects off-list intents or more than 3 questions", async () => {
    mockFetch(async () => json({ kind: "followups", questions: [{ intent: "rate_your_pain", question: "How bad?" }] }));
    await expect(fetchFollowUps(answers, false)).resolves.toEqual({ kind: "error", error: "failed" });

    const q = { intent: "clarify_wording", question: "What did you mean?" };
    mockFetch(async () => json({ kind: "followups", questions: [q, q, q, q] }));
    await expect(fetchFollowUps(answers, false)).resolves.toEqual({ kind: "error", error: "failed" });
  });

  it("returns the gate on an urgent response", async () => {
    mockFetch(async () => json({ kind: "urgent", gate }));
    await expect(fetchFollowUps(answers, false)).resolves.toEqual({ kind: "urgent", gate });
  });
});
