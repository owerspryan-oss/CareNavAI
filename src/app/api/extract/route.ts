import { randomUUID } from "node:crypto";
import { AiError } from "@/lib/ai/client";
import { ALLOWED_IMAGE_TYPES, extractFromImage } from "@/lib/ai/pipeline/extract";
import { json } from "@/lib/api/route";
import { env } from "@/lib/config/env";
import { log } from "@/lib/log/logger";

export const runtime = "nodejs";

// POST /api/extract (multipart, field "image"): letter photo -> text to confirm (FR-08).
// The image stays in memory for this request only (AC-08.5).
export async function POST(req: Request): Promise<Response> {
  const requestId = randomUUID();
  const started = Date.now();
  let status = 500;
  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      status = 400;
      return json({ error: "invalid_request" }, 400);
    }
    const file = form.get("image");
    if (!(file instanceof Blob) || !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      status = 400;
      return json({ error: "invalid_image" }, 400);
    }
    if (file.size > env().MAX_IMAGE_MB * 1024 * 1024) {
      status = 413;
      return json({ error: "image_too_large" }, 413);
    }
    const out = await extractFromImage(
      { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type as (typeof ALLOWED_IMAGE_TYPES)[number] },
      { requestId },
    );
    status = 200;
    // AC-08.4: poor legibility asks for a retake and returns no text to continue with.
    if (out.legibility === "poor") return json({ kind: "retake" });
    return json({ kind: "extracted", text: out.text, medicineCandidates: out.medicineCandidates });
  } catch (err) {
    status = err instanceof AiError && err.type === "cap_reached" ? 503 : 502;
    log.error({ requestId, route: "/api/extract", errorType: err instanceof AiError ? err.type : "unhandled" });
    return json({ error: status === 503 ? "service_busy" : "extraction_failed" }, status);
  } finally {
    log.info({ requestId, route: "/api/extract", status, durationMs: Date.now() - started });
  }
}
