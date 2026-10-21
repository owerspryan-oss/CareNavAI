import { z } from "zod";

// CONTEXT.md §11. Parsed once; invalid values fail at startup rather than at first use.
const bool = z
  .enum(["true", "false"])
  .transform((v) => v === "true");

export const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1).optional(),
  URGENT_MODE: z.enum(["continue_after_ack", "locked"]).default("continue_after_ack"),
  MONTHLY_CAP_GBP: z.coerce.number().positive().default(50),
  DAILY_SESSION_CAP: z.coerce.number().int().positive().default(200),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_PER_DAY: z.coerce.number().int().positive().default(300),
  MAX_TEXT_CHARS: z.coerce.number().int().positive().default(2000),
  MAX_LETTER_CHARS: z.coerce.number().int().positive().default(6000),
  MAX_AUDIO_SECONDS: z.coerce.number().int().positive().default(90),
  MAX_IMAGE_PX: z.coerce.number().int().positive().default(1600),
  MAX_IMAGE_MB: z.coerce.number().positive().default(8),
  DATA_KEY: z.string().optional(),
  PILOT_INVITE_REQUIRED: bool.default(false),
  PUBLIC_BASE_URL: z.url().default("http://localhost:3000"),
  CHILD_AGE_BANDS_STRICT: bool.default(true),
  SHOW_DRAFT_LABEL: bool.default(true),
  DATABASE_PATH: z.string().min(1).default("data/carenav.sqlite"),
  /** Chromium for the PDF renderer (ADR-008). Unset = Playwright's own browser lookup (PLAYWRIGHT_BROWSERS_PATH). */
  CHROMIUM_PATH: z.string().min(1).optional(),
  /** Largest /api/pdf request body: the result the client already holds (FR-10). */
  MAX_PDF_REQUEST_KB: z.coerce.number().int().positive().default(256),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error", "silent"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  // Treat empty strings as unset so a blank line in .env falls back to the default.
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ""),
  );
  return envSchema.parse(cleaned);
}

let cached: Env | undefined;

export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
