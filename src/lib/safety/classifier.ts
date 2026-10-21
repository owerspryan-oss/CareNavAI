import { z } from "zod";
import { callStructured, type AiDeps } from "@/lib/ai/client";
import { loadPrompt, wrapUserData } from "@/lib/ai/prompts";
import { gateClassifierOutputSchema, type AgeBand, type GateClassifierOutput } from "@/lib/ai/schemas";

/** Layer 2. Throws on any failure; the combiner turns that into `uncertain`. Input must already be redacted. */

export type ClassifyContext = {
  step: string;
  ageBand: AgeBand | null;
  endpoint: string;
  requestId?: string;
};

function contextBlock(ctx: ClassifyContext): string {
  return `<context>\nstep: ${ctx.step}\nsubject_age_band: ${ctx.ageBand ?? "not_stated"}\n</context>`;
}

export async function classify(redactedText: string, ctx: ClassifyContext, deps?: AiDeps): Promise<GateClassifierOutput> {
  return callStructured(
    {
      role: "GATE",
      endpoint: ctx.endpoint,
      requestId: ctx.requestId,
      schema: gateClassifierOutputSchema,
      schemaName: "gate_classification",
      instructions: loadPrompt("gate-classifier", "v1").text,
      input: `${contextBlock(ctx)}\n${wrapUserData("user_text", redactedText)}`,
    },
    deps,
  );
}

const englishPassSchema = z.object({ englishRendering: z.string(), ...gateClassifierOutputSchema.shape });

/** PRD 9.8: a second, independent pass on an English rendering, for languages without a rules list. */
export async function classifyViaEnglish(redactedText: string, ctx: ClassifyContext, deps?: AiDeps): Promise<GateClassifierOutput> {
  const out = await callStructured(
    {
      role: "GATE",
      endpoint: ctx.endpoint,
      requestId: ctx.requestId,
      schema: englishPassSchema,
      schemaName: "gate_classification_english",
      instructions: `${loadPrompt("gate-classifier-english", "v1").text}\n${loadPrompt("gate-classifier", "v1").text}`,
      input: `${contextBlock(ctx)}\n${wrapUserData("user_text", redactedText)}`,
    },
    deps,
  );
  // The rendering is discarded here: it is never returned, stored or logged.
  return gateClassifierOutputSchema.parse({
    level: out.level,
    categories: out.categories,
    possibleSignal: out.possibleSignal,
    language: out.language,
    register: out.register,
  });
}
