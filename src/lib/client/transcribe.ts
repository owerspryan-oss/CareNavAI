// Client for POST /api/transcribe (FR-07). The recording is sent once and not kept anywhere.

export type TranscribeOutcome =
  | { kind: "transcribed"; text: string }
  | { kind: "empty" }
  | { kind: "problem"; problem: "busy" | "failed" };

/** Transcription of up to MAX_AUDIO_SECONDS, plus one provider retry. */
const TRANSCRIBE_TIMEOUT_MS = 75_000;

export async function transcribeRecording(audio: Blob, seconds: number): Promise<TranscribeOutcome> {
  try {
    const form = new FormData();
    form.append("audio", audio, "recording");
    form.append("seconds", String(Math.max(1, Math.round(seconds))));
    const res = await fetch("/api/transcribe", { method: "POST", body: form, signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS), cache: "no-store" });
    if (res.status === 503 || res.status === 429) return { kind: "problem", problem: "busy" };
    if (!res.ok) return { kind: "problem", problem: "failed" };
    const body = (await res.json()) as { kind?: string; text?: unknown };
    if (body.kind === "transcribed" && typeof body.text === "string" && body.text.trim()) return { kind: "transcribed", text: body.text.trim() };
    if (body.kind === "empty" || body.kind === "transcribed") return { kind: "empty" };
    return { kind: "problem", problem: "failed" };
  } catch {
    return { kind: "problem", problem: "failed" };
  }
}
