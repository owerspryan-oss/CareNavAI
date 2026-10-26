import { afterEach, describe, expect, it, vi } from "vitest";
import { openDb } from "@/lib/db";
import { saveUserFeedback, userFeedbackSchema } from "@/lib/feedback/user";

// T-26 / FR-16: anonymous feedback after a result. Flow, language, answers, timestamp; nothing else.

describe("user feedback", () => {
  const ok = { flow: "prepare", language: "jam", confident: "yes", understandNext: "a_bit" };

  it("accepts the two answers, either of which may be skipped", () => {
    expect(userFeedbackSchema.safeParse(ok).success).toBe(true);
    expect(userFeedbackSchema.safeParse({ ...ok, understandNext: null }).success).toBe(true);
  });

  it("rejects no answers, unknown answers and any extra field (no content, no ids)", () => {
    expect(userFeedbackSchema.safeParse({ ...ok, confident: null, understandNext: null }).success).toBe(false);
    expect(userFeedbackSchema.safeParse({ ...ok, confident: "maybe" }).success).toBe(false);
    expect(userFeedbackSchema.safeParse({ ...ok, comment: "my knees hurt" }).success).toBe(false);
    expect(userFeedbackSchema.safeParse({ ...ok, userId: "u1" }).success).toBe(false);
  });

  it("stores only flow, language, answers and time", () => {
    const db = openDb(":memory:");
    saveUserFeedback(userFeedbackSchema.parse(ok), db, 1234);
    expect(db.prepare("SELECT * FROM feedback_user").all()).toEqual([{ id: 1, ts: 1234, flow: "prepare", language: "jam", q1: "yes", q2: "a_bit" }]);
    db.close();
  });
});

describe("POST /api/feedback", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/limits/rate");
    vi.doUnmock("@/lib/feedback/user");
  });

  it("saves valid feedback and rejects anything else", async () => {
    vi.doMock("@/lib/limits/rate", () => ({ checkRate: () => ({ ok: true, setCookie: null }) }));
    const actual = await vi.importActual<typeof import("@/lib/feedback/user")>("@/lib/feedback/user");
    const save = vi.fn();
    vi.doMock("@/lib/feedback/user", () => ({ ...actual, saveUserFeedback: save }));
    const { POST } = await import("@/app/api/feedback/route");
    const post = (body: unknown) => POST(new Request("http://localhost/api/feedback", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } }));

    expect((await post({ flow: "understand", language: "pcm", confident: "no", understandNext: "yes" })).status).toBe(200);
    expect(save).toHaveBeenCalledWith({ flow: "understand", language: "pcm", confident: "no", understandNext: "yes" });
    expect((await post({ flow: "understand", language: "pcm", confident: "no", understandNext: "yes", note: "x" })).status).toBe(400);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
