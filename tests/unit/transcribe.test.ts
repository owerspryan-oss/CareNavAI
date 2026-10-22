import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { transcribe } from "@/lib/ai/client";
import { openDb, type DB } from "@/lib/db";

// T-20 / FR-07: speech to text. Audio in memory only (AC-07.3), cap and ledger like every AI call.

const NOW = Date.UTC(2026, 9, 22, 12);
const audio = { bytes: new Uint8Array([1, 2, 3]), mimeType: "audio/webm", seconds: 30, maxSeconds: 90 };
const opts = { endpoint: "/api/transcribe", requestId: "req-1" };

function fakeOpenAI(create: (...args: unknown[]) => Promise<unknown>) {
  return { responses: {}, moderations: {}, audio: { transcriptions: { create: vi.fn(create) } } } as unknown as Pick<OpenAI, "responses" | "moderations" | "audio"> & {
    audio: { transcriptions: { create: ReturnType<typeof vi.fn> } };
  };
}

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
});
afterEach(() => db.close());

describe("transcribe", () => {
  it("returns the trimmed transcript and ledgers the recording's minutes", async () => {
    const openai = fakeOpenAI(() => Promise.resolve({ text: "  Mi knee dem a hurt mi  " }));
    expect(await transcribe(audio, opts, { openai, db, now: () => NOW })).toBe("Mi knee dem a hurt mi");
    const row = db.prepare("SELECT * FROM usage_ledger").get() as Record<string, unknown>;
    expect(row).toMatchObject({ endpoint: "/api/transcribe", role: "STT", request_id: "req-1" });
    expect(row.est_cost_gbp as number).toBeGreaterThan(0);
    const sent = openai.audio.transcriptions.create.mock.calls[0][0] as { file: File; model: string };
    expect(sent.file.name).toBe("recording.webm");
    expect(sent.model).toBeTruthy();
  });

  it("returns an empty string when nothing was heard", async () => {
    const openai = fakeOpenAI(() => Promise.resolve({ text: "   " }));
    expect(await transcribe(audio, opts, { openai, db, now: () => NOW })).toBe("");
  });

  it("refuses once the monthly cap is reached, without calling the provider", async () => {
    db.prepare("INSERT INTO usage_ledger (ts, endpoint, role, model, est_cost_gbp) VALUES (?, 'x', 'DRAFT', 'm', 50)").run(NOW - 1000);
    const openai = fakeOpenAI(() => Promise.resolve({ text: "x" }));
    await expect(transcribe(audio, opts, { openai, db, now: () => NOW })).rejects.toMatchObject({ type: "cap_reached" });
    expect(openai.audio.transcriptions.create).not.toHaveBeenCalled();
  });

  it("retries once, then reports a provider error", async () => {
    const openai = fakeOpenAI(() => Promise.reject(new Error("boom")));
    await expect(transcribe(audio, opts, { openai, db, now: () => NOW })).rejects.toMatchObject({ type: "provider_error" });
    expect(openai.audio.transcriptions.create).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/transcribe", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/lib/limits/rate");
    vi.doUnmock("@/lib/ai/client");
  });

  async function route(transcribed: string | Error = "hello") {
    vi.doMock("@/lib/limits/rate", () => ({ checkRate: () => ({ ok: true, setCookie: null }) }));
    const actual = await vi.importActual<typeof import("@/lib/ai/client")>("@/lib/ai/client");
    const fake = vi.fn(async (input: unknown) => {
      void input;
      if (transcribed instanceof Error) throw transcribed;
      return transcribed;
    });
    vi.doMock("@/lib/ai/client", () => ({ ...actual, transcribe: fake }));
    const { POST } = await import("@/app/api/transcribe/route");
    return { POST, fake };
  }
  const post = (POST: (r: Request) => Promise<Response>, fields: Record<string, Blob | string>) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.append(k, v);
    return POST(new Request("http://localhost/api/transcribe", { method: "POST", body: form }));
  };
  const clip = (type = "audio/webm;codecs=opus", size = 1000) => new Blob([new Uint8Array(size)], { type });

  it("transcribes a browser recording", async () => {
    const { POST, fake } = await route("hello there");
    const res = await post(POST, { audio: clip(), seconds: "12" });
    expect(await res.json()).toEqual({ kind: "transcribed", text: "hello there" });
    expect(fake.mock.calls[0][0]).toMatchObject({ mimeType: "audio/webm", seconds: 12 });
  });

  it("says empty when nothing was heard (AC-07.4)", async () => {
    const { POST } = await route("");
    expect(await (await post(POST, { audio: clip(), seconds: "3" })).json()).toEqual({ kind: "empty" });
  });

  it("rejects non-audio, a missing length and over-long recordings without calling the model", async () => {
    const { POST, fake } = await route();
    expect((await post(POST, { audio: clip("image/png"), seconds: "5" })).status).toBe(400);
    expect((await post(POST, { audio: clip() })).status).toBe(400);
    expect((await post(POST, { audio: clip(), seconds: "500" })).status).toBe(413);
    expect((await post(POST, { audio: clip("audio/webm", 50 * 1024 * 1024), seconds: "60" })).status).toBe(413);
    expect(fake).not.toHaveBeenCalled();
  });

  it("maps the cap to 503 and other failures to 502", async () => {
    const { AiError } = await import("@/lib/ai/client");
    let r = await route(new AiError("cap_reached"));
    expect((await post(r.POST, { audio: clip(), seconds: "5" })).status).toBe(503);
    vi.resetModules();
    r = await route(new AiError("provider_error"));
    expect((await post(r.POST, { audio: clip(), seconds: "5" })).status).toBe(502);
  });
});
