import { randomUUID } from "node:crypto";
import { AiError, transcribe } from "@/lib/ai/client";
import { json } from "@/lib/api/route";
import { env } from "@/lib/config/env";
import { checkRate } from "@/lib/limits/rate";
import { log } from "@/lib/log/logger";

export const runtime = "nodejs";

/** What browsers' MediaRecorder produces (Chrome/Edge webm, Firefox ogg, Safari mp4) plus common uploads. */
const ALLOWED_AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a"] as const;

/**
 * Generous bytes-per-second ceiling for a recording of MAX_AUDIO_SECONDS (compressed speech is ~4 to 16
 * KB/s; uncompressed 16 kHz WAV is 32 KB/s). Anything bigger is not a recording this app made.
 */
const MAX_BYTES_PER_SECOND = 48 * 1024;

// POST /api/transcribe (multipart: "audio" file, "seconds" its length): speech -> editable text (FR-07).
// The audio stays in memory for this request only and is never logged or stored (AC-07.3). The
// transcript is not screened here: it lands in an editable field and is screened like typed text when
// the person moves on (CLAUDE.md rule 1).
export async function POST(req: Request): Promise<Response> {
  const requestId = randomUUID();
  const started = Date.now();
  let status = 500;
  try {
    if (!checkRate(req).ok) {
      status = 429;
      return json({ error: "rate_limited" }, 429);
    }
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      status = 400;
      return json({ error: "invalid_request" }, 400);
    }
    const file = form.get("audio");
    const seconds = Number(form.get("seconds"));
    const baseType = file instanceof Blob ? file.type.split(";")[0].trim().toLowerCase() : "";
    if (!(file instanceof Blob) || !(ALLOWED_AUDIO_TYPES as readonly string[]).includes(baseType) || !Number.isFinite(seconds) || seconds <= 0) {
      status = 400;
      return json({ error: "invalid_audio" }, 400);
    }
    const maxSeconds = env().MAX_AUDIO_SECONDS;
    // A second of slack for the recorder's own stop latency.
    if (seconds > maxSeconds + 1 || file.size > (maxSeconds + 1) * MAX_BYTES_PER_SECOND) {
      status = 413;
      return json({ error: "audio_too_long" }, 413);
    }
    const text = await transcribe(
      { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: baseType, seconds, maxSeconds },
      { endpoint: "/api/transcribe", requestId },
    );
    status = 200;
    // AC-07.4: nothing heard -> the person types instead.
    return json(text ? { kind: "transcribed", text } : { kind: "empty" });
  } catch (err) {
    status = err instanceof AiError && err.type === "cap_reached" ? 503 : 502;
    log.error({ requestId, route: "/api/transcribe", errorType: err instanceof AiError ? err.type : "unhandled" });
    return json({ error: status === 503 ? "service_busy" : "transcription_failed" }, status);
  } finally {
    log.info({ requestId, route: "/api/transcribe", status, durationMs: Date.now() - started });
  }
}
