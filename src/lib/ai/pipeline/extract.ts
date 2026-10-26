import { z } from "zod";
import { callStructured, type AiDeps } from "@/lib/ai/client";
import { loadPrompt } from "@/lib/ai/prompts";
import { redact } from "@/lib/safety/redact";

export const EXTRACT_PROMPT = { name: "extract", version: "v1" } as const;

export const extractOutputSchema = z.object({
  text: z.string(),
  medicineCandidates: z.array(z.object({ name: z.string().min(1), dose: z.string().nullable() })),
  legibility: z.enum(["good", "poor"]),
});
export type ExtractOutput = z.infer<typeof extractOutputSchema>;

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Letter photo -> text for the user to confirm (FR-08, T-19, ADR-009). The image is held in
 * memory only, sent with store:false, and never written to disk or logged (AC-08.5).
 * Not screened here: the gate runs on the text once the user confirms it (PRD §9.5).
 */
export async function extractFromImage(
  image: { bytes: Uint8Array; mimeType: (typeof ALLOWED_IMAGE_TYPES)[number] },
  opts: { requestId?: string },
  deps?: AiDeps,
): Promise<ExtractOutput & { promptVersion: string }> {
  const prompt = loadPrompt(EXTRACT_PROMPT.name, EXTRACT_PROMPT.version);
  const dataUrl = `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}`;
  const out = await callStructured(
    {
      role: "VISION",
      endpoint: "/api/extract",
      requestId: opts.requestId,
      schema: extractOutputSchema,
      schemaName: "letter_extraction",
      instructions: prompt.text,
      input: [{ role: "user", content: [{ type: "input_image", image_url: dataUrl, detail: "high" }] }],
    },
    deps,
  );
  // Belt and braces: the local redactor also runs on what the model read.
  return { ...out, text: redact(out.text), promptVersion: prompt.version };
}
