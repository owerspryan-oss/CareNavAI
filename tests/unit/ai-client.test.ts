import OpenAI from "openai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiError, callStructured, moderate } from "@/lib/ai/client";
import { openDb, type DB } from "@/lib/db";

const schema = z.object({ answer: z.string() });
const NOW = Date.UTC(2026, 9, 21, 12);

function fakeOpenAI(parse: (...args: unknown[]) => Promise<unknown>) {
  return {
    responses: { parse: vi.fn(parse) },
    moderations: { create: vi.fn() },
  } as unknown as Pick<OpenAI, "responses" | "moderations"> & {
    responses: { parse: ReturnType<typeof vi.fn> };
    moderations: { create: ReturnType<typeof vi.fn> };
  };
}

const ok = (answer: unknown = "hi") =>
  Promise.resolve({
    output_parsed: { answer },
    usage: { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 0 } },
  });

const call = (role: "DRAFT" | "GATE" = "DRAFT") => ({
  role,
  endpoint: "/api/test",
  schema,
  schemaName: "test",
  instructions: "static rules",
  input: "<user_text>hello</user_text>",
  requestId: "req-1",
});

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
});
afterEach(() => db.close());

const ledgerCount = () => (db.prepare("SELECT count(*) n FROM usage_ledger").get() as { n: number }).n;

describe("callStructured (T-03)", () => {
  it("writes a ledger row with real token counts and sends store:false", async () => {
    const openai = fakeOpenAI(() => ok());
    const out = await callStructured(call(), { openai, db, now: () => NOW });
    expect(out).toEqual({ answer: "hi" });
    const row = db.prepare("SELECT * FROM usage_ledger").get() as Record<string, unknown>;
    expect(row).toMatchObject({ endpoint: "/api/test", role: "DRAFT", tokens_in: 1000, tokens_out: 200, request_id: "req-1" });
    expect(row.est_cost_gbp as number).toBeGreaterThan(0);
    expect(openai.responses.parse.mock.calls[0][0]).toMatchObject({ store: false, instructions: "static rules" });
  });

  it("refuses a generation call once the monthly cap is reached, without calling the provider", async () => {
    db.prepare("INSERT INTO usage_ledger (ts, endpoint, role, model, est_cost_gbp) VALUES (?, 'x', 'DRAFT', 'm', 50)").run(NOW - 1000);
    const openai = fakeOpenAI(() => ok());
    await expect(callStructured(call(), { openai, db, now: () => NOW })).rejects.toMatchObject({ type: "cap_reached" });
    expect(openai.responses.parse).not.toHaveBeenCalled();
  });

  it("ignores last month's spend", async () => {
    db.prepare("INSERT INTO usage_ledger (ts, endpoint, role, model, est_cost_gbp) VALUES (?, 'x', 'DRAFT', 'm', 50)").run(Date.UTC(2026, 8, 30));
    await expect(callStructured(call(), { openai: fakeOpenAI(() => ok()), db, now: () => NOW })).resolves.toBeDefined();
  });

  it("never caps the gate classifier", async () => {
    db.prepare("INSERT INTO usage_ledger (ts, endpoint, role, model, est_cost_gbp) VALUES (?, 'x', 'DRAFT', 'm', 500)").run(NOW);
    await expect(callStructured(call("GATE"), { openai: fakeOpenAI(() => ok()), db, now: () => NOW })).resolves.toEqual({ answer: "hi" });
  });

  it("retries once after a timeout", async () => {
    let n = 0;
    const openai = fakeOpenAI(() => (n++ === 0 ? Promise.reject(new OpenAI.APIConnectionTimeoutError()) : ok()));
    await expect(callStructured(call(), { openai, db, now: () => NOW })).resolves.toEqual({ answer: "hi" });
    expect(openai.responses.parse).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry with a typed error", async () => {
    const openai = fakeOpenAI(() => Promise.reject(new OpenAI.APIConnectionTimeoutError()));
    const err = await callStructured(call(), { openai, db, now: () => NOW }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.type).toBe("timeout");
    expect(openai.responses.parse).toHaveBeenCalledTimes(2);
  });

  it("rejects output that fails the schema after one retry, still ledgering both attempts", async () => {
    const openai = fakeOpenAI(() => ok(42));
    await expect(callStructured(call(), { openai, db, now: () => NOW })).rejects.toMatchObject({ type: "invalid_output" });
    expect(openai.responses.parse).toHaveBeenCalledTimes(2);
    expect(ledgerCount()).toBe(2);
  });

  it("fails with no_api_key when no client and no key are configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(callStructured(call(), { db, now: () => NOW })).rejects.toMatchObject({ type: "no_api_key" });
    vi.unstubAllEnvs();
  });
});

describe("moderate", () => {
  it("returns flags and ledgers the call", async () => {
    const openai = fakeOpenAI(() => ok());
    openai.moderations.create.mockResolvedValue({
      results: [{ flagged: true, categories: { "self-harm": true }, category_scores: { "self-harm": 0.9 } }],
    });
    const r = await moderate("text", { endpoint: "/api/screen" }, { openai, db, now: () => NOW });
    expect(r.flagged).toBe(true);
    expect(ledgerCount()).toBe(1);
  });

  it("throws a typed error when the provider fails twice", async () => {
    const openai = fakeOpenAI(() => ok());
    openai.moderations.create.mockRejectedValue(new Error("boom"));
    await expect(moderate("t", { endpoint: "/api/screen" }, { openai, db })).rejects.toMatchObject({ type: "provider_error" });
    expect(openai.moderations.create).toHaveBeenCalledTimes(2);
  });
});
