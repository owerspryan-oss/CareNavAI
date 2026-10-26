import pino, { type DestinationStream } from "pino";

/**
 * Allow-list logger (CLAUDE.md rule 8, CONTEXT.md §13).
 * Only these fields can ever be written. Anything else is dropped before it
 * reaches pino, so user content cannot leak into logs by accident.
 */
export const LOG_FIELDS = [
  "requestId",
  "route",
  "step",
  "status",
  "durationMs",
  "modelRole",
  "inputTokens",
  "outputTokens",
  "safetyLevel",
  "languageCode",
  "errorType",
] as const;

export type LogField = (typeof LOG_FIELDS)[number];
type LogValue = string | number | boolean | null;
export type LogEntry = Partial<Record<LogField, LogValue>>;

// Free-text-looking values are refused even in allowed fields (e.g. an error
// message pasted into errorType). Allowed string values are short identifiers.
const SAFE_STRING = /^[A-Za-z0-9_.:\-/]{0,64}$/;

export function sanitize(entry: Record<string, unknown>): LogEntry {
  const out: LogEntry = {};
  for (const key of LOG_FIELDS) {
    const v = entry[key];
    if (v === undefined) continue;
    if (typeof v === "number" || typeof v === "boolean" || v === null) out[key] = v;
    else if (typeof v === "string" && SAFE_STRING.test(v)) out[key] = v;
    else out[key] = "[dropped]";
  }
  return out;
}

export type Logger = {
  info(entry: LogEntry): void;
  warn(entry: LogEntry): void;
  error(entry: LogEntry): void;
};

export function createLogger(opts: { level?: string; destination?: DestinationStream } = {}): Logger {
  const base = pino(
    {
      level: opts.level ?? process.env.LOG_LEVEL ?? "info",
      base: undefined, // no pid/hostname
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    opts.destination,
  );
  // Message argument is deliberately not exposed: a free-text message is where content leaks.
  return {
    info: (e) => base.info(sanitize(e)),
    warn: (e) => base.warn(sanitize(e)),
    error: (e) => base.error(sanitize(e)),
  };
}

export const log = createLogger();
