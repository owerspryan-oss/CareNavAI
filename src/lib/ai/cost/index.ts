import { pricingConfig } from "@/lib/config";
import type { DB } from "@/lib/db";

export type Usage = { inputTokens: number; cachedInputTokens?: number; outputTokens: number };

/** GBP cost of a text call. Unknown models throw: an unpriced model must not slip past the cap. */
export function costGbp(model: string, usage: Usage): number {
  const p = pricingConfig.models[model];
  if (!p) throw new Error(`no price for model ${model}`);
  const cached = usage.cachedInputTokens ?? 0;
  const usd =
    ((usage.inputTokens - cached) * (p.inputPer1M ?? 0) +
      cached * (p.cachedInputPer1M ?? p.inputPer1M ?? 0) +
      usage.outputTokens * (p.outputPer1M ?? 0)) /
    1_000_000;
  return usd * pricingConfig.gbpPerUsd;
}

/** GBP cost of a speech-to-text call, priced per audio minute. Unknown models throw, as above. */
export function audioCostGbp(model: string, seconds: number): number {
  const p = pricingConfig.models[model];
  if (p?.perAudioMinute === undefined) throw new Error(`no audio price for model ${model}`);
  return ((p.perAudioMinute * seconds) / 60) * pricingConfig.gbpPerUsd;
}

/** Pessimistic pre-call estimate: ~3 chars per token (non-Latin scripts run higher) plus the full output budget. */
export function estimateCostGbp(model: string, inputChars: number, maxOutputTokens: number): number {
  return costGbp(model, { inputTokens: Math.ceil(inputChars / 3), outputTokens: maxOutputTokens });
}

export function monthStartUtc(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function monthToDateGbp(db: DB, now: number): number {
  const row = db
    .prepare("SELECT COALESCE(SUM(est_cost_gbp), 0) AS total FROM usage_ledger WHERE ts >= ?")
    .get(monthStartUtc(now)) as { total: number };
  return row.total;
}

export type LedgerRow = {
  ts: number;
  endpoint: string;
  role: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  estCostGbp: number;
  requestId: string | null;
};

export function writeLedger(db: DB, r: LedgerRow): void {
  db.prepare(
    `INSERT INTO usage_ledger (ts, endpoint, role, model, tokens_in, tokens_out, est_cost_gbp, request_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(r.ts, r.endpoint, r.role, r.model, r.tokensIn, r.tokensOut, r.estCostGbp, r.requestId);
}
