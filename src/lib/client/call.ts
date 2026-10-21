import { gateResultSchema, type GateResult } from "@/lib/ai/schemas";
import { failClosedResult } from "./screen";

/*
 * Shared plumbing for the client's JSON calls to the generate routes (Journey 1 and Journey 2).
 * Never throws. An `urgent` response whose gate is malformed still routes up, as `uncertain`
 * (CLAUDE.md rule 2).
 */

/** Why a call produced nothing usable. Maps to static copy, never to server text. */
export type CallError = "too_long" | "busy" | "failed";

export function statusError(status: number): CallError {
  if (status === 413) return "too_long";
  if (status === 503) return "busy";
  return "failed";
}

/** A gate result that routes up. Anything malformed, or a `clear` inside an urgent response, becomes `uncertain`. */
export function urgentGate(raw: unknown): GateResult {
  const parsed = gateResultSchema.safeParse(raw);
  return parsed.success && parsed.data.level !== "clear" ? parsed.data : failClosedResult();
}

export type Raw = { ok: true; body: unknown } | { ok: false; error: CallError };

export async function post(url: string, body: unknown, timeoutMs: number): Promise<Raw> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    if (!res.ok) return { ok: false, error: statusError(res.status) };
    return { ok: true, body: await res.json() };
  } catch {
    return { ok: false, error: "failed" };
  }
}

export function isUrgent(body: unknown): body is { kind: "urgent"; gate: unknown } {
  return typeof body === "object" && body !== null && (body as { kind?: unknown }).kind === "urgent";
}
