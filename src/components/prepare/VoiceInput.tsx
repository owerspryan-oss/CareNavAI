"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { transcribeRecording } from "@/lib/client/transcribe";
import { format } from "@/lib/i18n/messages";
import { MicIcon } from "@/components/ui/icons";
import { usePrepareCopy } from "./copy";
import styles from "./VoiceInput.module.css";

type Note = "heard" | "empty" | "failed" | "noMic" | "busy";
type Phase = { name: "idle"; note?: Note } | { name: "consent" } | { name: "recording"; left: number } | { name: "sending" };

/** Shown once per page load: the recording goes to the AI provider (disclosed before first use, CONTEXT.md §7). */
let disclosed = false;

const MIME_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function recorderSupported(): boolean {
  return typeof window !== "undefined" && typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

const noSubscribe = () => () => {};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Voice input for one free-text field (FR-07). Records up to `maxSeconds` (AC-07.1), sends it once for
 * transcription and hands the words to `onText`, which puts them in the editable field: nothing moves on
 * until the person presses Next, and the words are screened then like typed text (AC-07.2). The audio
 * lives only in this component's memory and is dropped once sent (AC-07.3). Any failure or silence says
 * to type instead (AC-07.4). Rendered only for languages whose speech-to-text is tested (AC-07.5).
 */
export function VoiceInput({ maxSeconds, disabled, onText }: { maxSeconds: number; disabled?: boolean; onText: (text: string) => void }) {
  const c = usePrepareCopy().voice;
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  // False on the server and during hydration, the browser's real answer after: no mismatch.
  const supported = useSyncExternalStore(noSubscribe, recorderSupported, () => false);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  // finish() runs from the recorder's onstop, long after the render that started it: always use the
  // latest onText, so anything typed while recording is kept.
  const latestOnText = useRef(onText);
  useEffect(() => {
    latestOnText.current = onText;
  });

  function release() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  }

  // Leaving the step mid-recording: stop the microphone and throw the audio away.
  useEffect(
    () => () => {
      if (recorder.current && recorder.current.state !== "inactive") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      chunks.current = [];
      release();
    },
    [],
  );

  async function start() {
    disclosed = true;
    let media: MediaStream;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setPhase({ name: "idle", note: "noMic" });
      return;
    }
    stream.current = media;
    const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(media, mimeType ? { mimeType } : undefined);
    recorder.current = rec;
    chunks.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };
    rec.onstop = () => void finish(rec.mimeType);
    startedAt.current = performance.now();
    rec.start(1000);
    setPhase({ name: "recording", left: maxSeconds });
    timer.current = setInterval(() => {
      const left = Math.max(0, maxSeconds - (performance.now() - startedAt.current) / 1000);
      if (left <= 0) stop();
      else setPhase({ name: "recording", left });
    }, 250);
  }

  function stop() {
    if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop();
    release();
  }

  async function finish(mimeType: string) {
    const seconds = Math.min(maxSeconds, (performance.now() - startedAt.current) / 1000);
    const audio = new Blob(chunks.current, { type: mimeType || "audio/webm" });
    chunks.current = [];
    recorder.current = null;
    if (audio.size === 0) {
      setPhase({ name: "idle", note: "empty" });
      return;
    }
    setPhase({ name: "sending" });
    const out = await transcribeRecording(audio, seconds);
    if (out.kind === "transcribed") {
      latestOnText.current(out.text);
      setPhase({ name: "idle", note: "heard" });
    } else {
      setPhase({ name: "idle", note: out.kind === "empty" ? "empty" : out.problem });
    }
  }

  if (!supported) return null;

  return (
    <div className={styles.voice}>
      <p className={styles.status} role="status">
        {phase.name === "recording" && format(c.remaining, { time: clock(phase.left) })}
        {phase.name === "sending" && c.transcribing}
        {phase.name === "idle" && phase.note && c[phase.note]}
      </p>
      {phase.name === "consent" ? (
        <div className={styles.consent}>
          <p>{c.privacy}</p>
          <div className={styles.consentActions}>
            <button type="button" className={styles.link} onClick={() => setPhase({ name: "idle" })}>
              {c.cancel}
            </button>
            <button type="button" className={styles.button} onClick={() => void start()}>
              <MicIcon className={styles.icon} />
              {c.begin}
            </button>
          </div>
        </div>
      ) : phase.name === "recording" ? (
        <button type="button" className={`${styles.button} ${styles.recording}`} onClick={stop}>
          <span className={styles.dot} aria-hidden="true" />
          {c.stop}
        </button>
      ) : (
        <button
          type="button"
          className={styles.button}
          aria-label={c.startLabel}
          disabled={disabled || phase.name === "sending"}
          onClick={() => (disclosed ? void start() : setPhase({ name: "consent" }))}
        >
          <MicIcon className={styles.icon} />
          {c.start}
        </button>
      )}
    </div>
  );
}
