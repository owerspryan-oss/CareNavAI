import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { modelFor, type ModelRole } from "@/lib/config";
import { env } from "@/lib/config/env";
import { db as defaultDb, type DB } from "@/lib/db";
import { log } from "@/lib/log/logger";
import { audioCostGbp, costGbp, estimateCostGbp, monthToDateGbp, writeLedger } from "./cost";

/**
 * The one wrapper every AI call goes through (PRD §10.3, §10.6):
 * cap check -> call with timeout and one retry -> schema validation -> ledger row.
 * `store: false` on every call. No request or response content is logged.
 */

export type AiErrorType = "no_api_key" | "cap_reached" | "timeout" | "provider_error" | "invalid_output";

export class AiError extends Error {
  constructor(readonly type: AiErrorType) {
    super(type);
    this.name = "AiError";
  }
}

// The gate and moderation are never stopped by the cap (PRD §10.6, T-25).
const CAP_EXEMPT: ReadonlySet<ModelRole> = new Set(["GATE", "MODERATION"]);

type OpenAILike = Pick<OpenAI, "responses" | "moderations"> & Partial<Pick<OpenAI, "audio">>;

export type AiDeps = {
  openai?: OpenAILike;
  db?: DB;
  now?: () => number;
  capGbp?: number;
};

export type StructuredCall<S extends z.ZodType> = {
  role: ModelRole;
  endpoint: string;
  schema: S;
  schemaName: string;
  /** Static rules, tone and schema description. Kept first so provider prompt caching applies. */
  instructions: string;
  /** Variable content, last. User text must already be redacted and wrapped in delimiters. */
  input: string | OpenAI.Responses.ResponseInput;
  requestId?: string;
};

let defaultClient: OpenAI | undefined;

function openaiClient(deps: AiDeps): OpenAILike {
  if (deps.openai) return deps.openai;
  const apiKey = env().OPENAI_API_KEY;
  if (!apiKey) throw new AiError("no_api_key");
  defaultClient ??= new OpenAI({ apiKey, maxRetries: 0 });
  return defaultClient;
}

function inputChars(input: StructuredCall<z.ZodType>["input"]): number {
  return typeof input === "string" ? input.length : JSON.stringify(input).length;
}

async function withOneRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return fn();
  }
}

function classify(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof OpenAI.APIConnectionTimeoutError) return new AiError("timeout");
  if (err instanceof Error && err.name === "AbortError") return new AiError("timeout");
  return new AiError("provider_error");
}

function checkCap(role: ModelRole, model: string, chars: number, maxOut: number, deps: Required<Pick<AiDeps, "db" | "now">> & AiDeps) {
  if (CAP_EXEMPT.has(role)) return;
  const cap = deps.capGbp ?? env().MONTHLY_CAP_GBP;
  if (monthToDateGbp(deps.db, deps.now()) + estimateCostGbp(model, chars, maxOut) > cap) {
    throw new AiError("cap_reached");
  }
}

export async function callStructured<S extends z.ZodType>(call: StructuredCall<S>, deps: AiDeps = {}): Promise<z.infer<S>> {
  const { model, timeoutMs, maxOutputTokens } = modelFor(call.role);
  const now = deps.now ?? Date.now;
  const database = deps.db ?? defaultDb();
  const started = now();
  const meta = { requestId: call.requestId, route: call.endpoint, modelRole: call.role };

  try {
    checkCap(call.role, model, inputChars(call.input) + call.instructions.length, maxOutputTokens, { ...deps, db: database, now });
    const client = openaiClient(deps);

    const response = await withOneRetry(async () => {
      const res = await client.responses.parse(
        {
          model,
          store: false,
          instructions: call.instructions,
          input: call.input,
          max_output_tokens: maxOutputTokens,
          text: { format: zodTextFormat(call.schema, call.schemaName) },
        },
        { timeout: timeoutMs },
      );
      // Ledger every attempt that reached the provider, even if its output is then rejected.
      const usage = {
        inputTokens: res.usage?.input_tokens ?? 0,
        cachedInputTokens: res.usage?.input_tokens_details?.cached_tokens ?? 0,
        outputTokens: res.usage?.output_tokens ?? 0,
      };
      writeLedger(database, {
        ts: now(),
        endpoint: call.endpoint,
        role: call.role,
        model,
        tokensIn: usage.inputTokens,
        tokensOut: usage.outputTokens,
        estCostGbp: costGbp(model, usage),
        requestId: call.requestId ?? null,
      });
      const parsed = call.schema.safeParse(res.output_parsed);
      if (!parsed.success) throw new AiError("invalid_output");
      return { data: parsed.data as z.infer<S>, usage };
    });

    log.info({ ...meta, status: "ok", durationMs: now() - started, inputTokens: response.usage.inputTokens, outputTokens: response.usage.outputTokens });
    return response.data;
  } catch (err) {
    const e = classify(err);
    log.warn({ ...meta, status: "error", errorType: e.type, durationMs: now() - started });
    throw e;
  }
}

/** Moderation layer call. Returns the raw category flags; the safety gate interprets them. */
export async function moderate(text: string, opts: { endpoint: string; requestId?: string }, deps: AiDeps = {}) {
  const { model, timeoutMs } = modelFor("MODERATION");
  const now = deps.now ?? Date.now;
  const started = now();
  try {
    const client = openaiClient(deps);
    const res = await withOneRetry(() => client.moderations.create({ model, input: text }, { timeout: timeoutMs }));
    const result = res.results[0];
    if (!result) throw new AiError("invalid_output");
    writeLedger(deps.db ?? defaultDb(), {
      ts: now(),
      endpoint: opts.endpoint,
      role: "MODERATION",
      model,
      tokensIn: 0,
      tokensOut: 0,
      estCostGbp: 0,
      requestId: opts.requestId ?? null,
    });
    log.info({ requestId: opts.requestId, route: opts.endpoint, modelRole: "MODERATION", status: "ok", durationMs: now() - started });
    return { flagged: result.flagged, categories: result.categories, scores: result.category_scores };
  } catch (err) {
    const e = classify(err);
    log.warn({ requestId: opts.requestId, route: opts.endpoint, modelRole: "MODERATION", status: "error", errorType: e.type });
    throw e;
  }
}

/**
 * Speech to text (FR-07). The audio stays in memory: it goes to the provider as a buffer and is never
 * written anywhere (AC-07.3). The cap is checked against the longest allowed recording before the call;
 * the ledger records the recording's own length. Returns the transcript, trimmed (may be empty).
 */
export async function transcribe(
  audio: { bytes: Uint8Array; mimeType: string; seconds: number; maxSeconds: number },
  opts: { endpoint: string; requestId?: string },
  deps: AiDeps = {},
): Promise<string> {
  const { model, timeoutMs } = modelFor("STT");
  const now = deps.now ?? Date.now;
  const database = deps.db ?? defaultDb();
  const started = now();
  const meta = { requestId: opts.requestId, route: opts.endpoint, modelRole: "STT" as const };
  try {
    const cap = deps.capGbp ?? env().MONTHLY_CAP_GBP;
    if (monthToDateGbp(database, now()) + audioCostGbp(model, audio.maxSeconds) > cap) throw new AiError("cap_reached");
    const client = openaiClient(deps);
    if (!client.audio) throw new AiError("provider_error");
    const audioApi = client.audio;
    const ext = audio.mimeType.split("/")[1]?.split(";")[0] ?? "webm";
    const res = await withOneRetry(async () => {
      const file = await toFile(audio.bytes, `recording.${ext}`, { type: audio.mimeType });
      const out = await audioApi.transcriptions.create({ model, file }, { timeout: timeoutMs });
      writeLedger(database, {
        ts: now(),
        endpoint: opts.endpoint,
        role: "STT",
        model,
        tokensIn: 0,
        tokensOut: 0,
        estCostGbp: audioCostGbp(model, Math.min(audio.seconds, audio.maxSeconds)),
        requestId: opts.requestId ?? null,
        audioSeconds: Math.min(audio.seconds, audio.maxSeconds),
      });
      return out;
    });
    log.info({ ...meta, status: "ok", durationMs: now() - started });
    return (res.text ?? "").trim();
  } catch (err) {
    const e = classify(err);
    log.warn({ ...meta, status: "error", errorType: e.type, durationMs: now() - started });
    throw e;
  }
}
