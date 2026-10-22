import { assertSessionAvailable } from "@/lib/limits/sessions";
import type { AiDeps } from "@/lib/ai/client";
import {
  postAppointmentDraftSchema,
  preAppointmentDraftSchema,
  prepareFreeText,
  type ExplainRequest,
  type FollowUpsRequest,
  type GateResult,
  type PostAppointmentResult,
  type PreAppointmentResult,
  type PrepareAnswers,
  type ResultMeta,
  type SummaryRequest,
} from "@/lib/ai/schemas";
import { assertTextLimit, type Ctx } from "@/lib/api/route";
import { env } from "@/lib/config/env";
import { getDisclaimers, getServiceRoutes } from "@/lib/content";
import { gateDecision, publicResult, screen } from "@/lib/safety/gate";
import { redact } from "@/lib/safety/redact";
import { deriveVersion, targetFor, type Target } from "./derive";
import { generateFollowUps, type FollowUp } from "./followups";
import { generatePreMaster } from "./prepare";
import { generatePostMaster, type GroundedPost } from "./understand";

/**
 * The request pipelines (CONTEXT.md §4.2). Fixed order, never chosen by a model:
 * limits -> combined re-screen -> gate decision -> English master -> derived version -> validators.
 * An urgent response carries only the gate result: no AI text is ever returned beside it (rule 3).
 */

export type UrgentResponse = { kind: "urgent"; gate: GateResult };

function urgent(gate: GateResult): UrgentResponse {
  return { kind: "urgent", gate };
}

function combined(parts: { step: string; text: string }[]): string {
  return parts.map((p) => p.text).join("\n\n");
}

function redactAnswers(a: PrepareAnswers): PrepareAnswers {
  const r = (t: string | null) => (t === null ? null : redact(t));
  return {
    ...a,
    forWhom: { ...a.forWhom, label: r(a.forWhom.label) },
    mainConcern: redact(a.mainConcern),
    timing: { ...a.timing, note: r(a.timing.note) },
    changes: r(a.changes),
    medicines: r(a.medicines),
    previousSupport: r(a.previousSupport),
    worries: r(a.worries),
    followUps: a.followUps.map((f) => ({ ...f, answer: r(f.answer) })),
  };
}

function chooseTarget(gate: GateResult, outputLanguage: string | null): Target {
  return outputLanguage ? targetFor(outputLanguage, "standard") : targetFor(gate.language, gate.register);
}

function meta(gate: GateResult, target: Target, promptVersion: string, confidenceNotice: boolean, urgentAcknowledged: ResultMeta["urgentAcknowledged"]): ResultMeta {
  return {
    detectedLanguage: gate.language,
    register: gate.register,
    outputLanguage: target.code,
    outputMode: target.mode,
    promptVersion,
    confidenceNotice,
    urgentAcknowledged,
  };
}

// ---- Journey 1 -------------------------------------------------------------

export type SummaryResponse =
  | UrgentResponse
  | {
      kind: "result";
      english: PreAppointmentResult;
      user: PreAppointmentResult | null;
      userFallback: "parity" | "protected_spans" | "call_failed" | null;
    };

function preStatic(lang: string) {
  const routes = getServiceRoutes(lang).content;
  return {
    serviceRoutes: routes.sets.preAppointment.map((id) => routes.routes.find((r) => r.id === id)!),
    disclaimer: getDisclaimers(lang).content.preAppointment,
  };
}

export async function runSummary(req: SummaryRequest, ctx: Ctx, deps?: AiDeps): Promise<SummaryResponse> {
  const parts = prepareFreeText(req.answers);
  assertTextLimit(parts.map((p) => p.text));

  const gate = await screen(combined(parts), { step: "combined", ageBand: req.answers.forWhom.ageBand, languageHint: null, endpoint: "/api/summary", requestId: ctx.requestId }, deps);
  const decision = gateDecision(gate, req.acknowledgedUrgent);
  if (!decision.proceed) return urgent(publicResult(gate));
  assertSessionAvailable(deps);

  const redacted = redactAnswers(req.answers);
  const { draft, promptVersion } = await generatePreMaster(redacted, { requestId: ctx.requestId }, deps);
  const target = chooseTarget(gate, req.outputLanguage);
  const medicines = draft.medicationAndSupport.medicines.map((m) => m.name);
  const derived = await deriveVersion(draft, preAppointmentDraftSchema, target, medicines, { endpoint: "/api/summary", requestId: ctx.requestId }, deps);

  const versions = `${promptVersion}+${derived.promptVersion}`;
  const english: PreAppointmentResult = { ...draft, ...preStatic("en"), meta: meta(gate, targetFor("en", "standard"), versions, false, decision.urgentAcknowledged) };
  const user: PreAppointmentResult | null = derived.ok
    ? { ...derived.version, ...preStatic(target.code), meta: meta(gate, target, versions, derived.confidenceNotice, decision.urgentAcknowledged) }
    : null;
  return { kind: "result", english, user, userFallback: derived.ok ? null : derived.reason };
}

// ---- Journey 2 -------------------------------------------------------------

export type ExplainResponse =
  | UrgentResponse
  | {
      kind: "result";
      english: PostAppointmentResult;
      user: PostAppointmentResult | null;
      userFallback: "parity" | "protected_spans" | "call_failed" | null;
    };

export async function runExplain(req: ExplainRequest, ctx: Ctx, deps?: AiDeps): Promise<ExplainResponse> {
  assertTextLimit([req.confirmedText], env().MAX_LETTER_CHARS);
  assertTextLimit(req.followUps.map((f) => f.answer));

  // AC-05.9: the letter itself is screened; routine "urgent referral" wording routes up too.
  const answers = req.followUps.map((f) => f.answer).filter((a): a is string => !!a);
  const gate = await screen([req.confirmedText, ...answers].join("\n\n"), { step: "letter_text", ageBand: null, languageHint: null, endpoint: "/api/explain", requestId: ctx.requestId }, deps);
  const decision = gateDecision(gate, req.acknowledgedUrgent);
  if (!decision.proceed) return urgent(publicResult(gate));
  assertSessionAvailable(deps);

  const source = redact(req.confirmedText);
  const followUps = req.followUps.map((f) => ({ ...f, answer: f.answer === null ? null : redact(f.answer) }));
  const { result, promptVersion } = await generatePostMaster(source, { followUps }, { requestId: ctx.requestId }, deps);
  // The letter is usually English; the user-facing language comes from the request or the follow-up answers.
  const target = chooseTarget(gate, req.outputLanguage);
  const { ungrounded, ...grounded } = result;
  const derived = await deriveVersion(grounded, postAppointmentDraftSchema, target, grounded.medicines.map((m) => m.name), { endpoint: "/api/explain", requestId: ctx.requestId }, deps);

  const versions = `${promptVersion}+${derived.promptVersion}`;
  const build = (body: Omit<GroundedPost, "ungrounded">, lang: string, m: ResultMeta): PostAppointmentResult => ({
    ...body,
    ungrounded,
    disclaimer: getDisclaimers(lang).content.postAppointment,
    meta: m,
  });
  const english = build(grounded, "en", meta(gate, targetFor("en", "standard"), versions, false, decision.urgentAcknowledged));
  const user = derived.ok ? build(derived.version, target.code, meta(gate, target, versions, derived.confidenceNotice, decision.urgentAcknowledged)) : null;
  return { kind: "result", english, user, userFallback: derived.ok ? null : derived.reason };
}

// ---- Follow-ups --------------------------------------------------------------

export type FollowUpsResponse = UrgentResponse | { kind: "followups"; questions: FollowUp[] };

export async function runFollowUps(req: FollowUpsRequest, ctx: Ctx, deps?: AiDeps): Promise<FollowUpsResponse> {
  const prepare = req.journey === "prepare";
  const parts = prepare ? prepareFreeText(req.answers) : [{ step: "letter_text", text: req.confirmedText }];
  assertTextLimit(parts.map((p) => p.text), prepare ? env().MAX_TEXT_CHARS : env().MAX_LETTER_CHARS);
  const text = combined(parts);

  const gate = await screen(text, { step: "combined", ageBand: prepare ? req.answers.forWhom.ageBand : null, languageHint: null, endpoint: "/api/followups", requestId: ctx.requestId }, deps);
  if (!gateDecision(gate, req.acknowledgedUrgent).proceed) return urgent(publicResult(gate));

  const data = prepare
    ? [
        `started: ${req.answers.timing.started ?? "not_stated"}`,
        `pattern: ${req.answers.timing.pattern ?? "not_stated"}`,
        ...prepareFreeText(redactAnswers(req.answers)).map((p) => `${p.step}: ${p.text}`),
      ].join("\n")
    : redact(req.confirmedText);
  const { questions } = await generateFollowUps(req.journey, data, { requestId: ctx.requestId }, deps);
  return { kind: "followups", questions };
}
