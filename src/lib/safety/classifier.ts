import { z } from "zod";
import { callStructured, type AiDeps } from "@/lib/ai/client";
import { loadPrompt, wrapUserData } from "@/lib/ai/prompts";
import { gateClassifierOutputSchema, type AgeBand, type GateClassifierOutput } from "@/lib/ai/schemas";
import type { ContextPair } from "./context";

/** Layer 2. Throws on any failure; the combiner turns that into `uncertain`. Input must already be redacted. */

const PROMPT = ["gate-classifier", "v3"] as const;
export const CLASSIFIER_PROMPT_VERSION = `${PROMPT[0]}@${PROMPT[1]}`;

/** Earlier questions and answers, already redacted. Context only: the level is for the current text. */
export type ClassifierContext = { question: string | null; earlier: ContextPair[] };

export type ClassifyContext = {
  step: string;
  ageBand: AgeBand | null;
  endpoint: string;
  requestId?: string;
  context?: ClassifierContext | null;
};

const BLOCK_TAGS = /<\/?\s*(?:context|question_asked|earlier_answers|user_text)\s*>/gi;

/** No piece of user-held text may open or close any of the blocks, so it can't pose as another block. */
function data(tag: string, text: string): string {
  return wrapUserData(tag, text.replace(BLOCK_TAGS, "[removed-tag]"));
}

/** Server metadata, then the delimited user data, with the current text last. */
export function classifierInput(redactedText: string, ctx: ClassifyContext): string {
  const parts = [`<context>\nstep: ${ctx.step}\nsubject_age_band: ${ctx.ageBand ?? "not_stated"}\n</context>`];
  const c = ctx.context;
  if (c?.earlier.length) parts.push(data("earlier_answers", c.earlier.map((p) => `Q: ${p.question}\nA: ${p.answer}`).join("\n\n")));
  if (c?.question) parts.push(data("question_asked", c.question));
  parts.push(data("user_text", redactedText));
  return parts.join("\n");
}

export async function classify(redactedText: string, ctx: ClassifyContext, deps?: AiDeps): Promise<GateClassifierOutput> {
  return callStructured(
    {
      role: "GATE",
      endpoint: ctx.endpoint,
      requestId: ctx.requestId,
      schema: gateClassifierOutputSchema,
      schemaName: "gate_classification",
      instructions: loadPrompt(...PROMPT).text,
      input: classifierInput(redactedText, ctx),
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
      instructions: `${loadPrompt("gate-classifier-english", "v1").text}\n${loadPrompt(...PROMPT).text}`,
      input: classifierInput(redactedText, ctx),
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
