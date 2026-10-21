import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { env } from "@/lib/config/env";
import { log } from "@/lib/log/logger";
import { AiError } from "@/lib/ai/client";

/**
 * Shared route wrapper: request id, JSON + Zod validation, free-text length limit, and
 * errors mapped to a friendly response with no content. Logs allow-listed fields only.
 */
export type Ctx = { requestId: string };

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** Throws 413 when any free-text field is longer than MAX_TEXT_CHARS (CONTEXT.md §11). */
export function assertTextLimit(texts: (string | null | undefined)[], max = env().MAX_TEXT_CHARS): void {
  if (texts.some((t) => (t?.length ?? 0) > max)) throw new HttpError(413, "text_too_long");
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function handler<S extends z.ZodType>(route: string, schema: S, fn: (body: z.infer<S>, ctx: Ctx) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const requestId = randomUUID();
    const started = Date.now();
    let status = 500;
    try {
      let raw: unknown;
      try {
        raw = await req.json();
      } catch {
        throw new HttpError(400, "invalid_json");
      }
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new HttpError(400, "invalid_request");
      const res = await fn(parsed.data, { requestId });
      status = res.status;
      return res;
    } catch (err) {
      if (err instanceof HttpError) {
        status = err.status;
        return json({ error: err.code }, err.status);
      }
      if (err instanceof AiError && err.type === "cap_reached") {
        status = 503;
        return json({ error: "service_busy" }, 503);
      }
      status = 502;
      log.error({ requestId, route, errorType: err instanceof AiError ? err.type : "unhandled" });
      return json({ error: "generation_failed" }, 502);
    } finally {
      log.info({ requestId, route, status, durationMs: Date.now() - started });
    }
  };
}
