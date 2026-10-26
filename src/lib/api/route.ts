import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { env } from "@/lib/config/env";
import { log } from "@/lib/log/logger";
import { AiError } from "@/lib/ai/client";
import { checkRate } from "@/lib/limits/rate";

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

/**
 * The shared wrapper without a body: per-device rate limit, then `fn`; errors become a friendly
 * response with no content. Used directly by GET/DELETE routes and by `handler` for JSON posts.
 */
export function handle(route: string, fn: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const requestId = randomUUID();
    const started = Date.now();
    let status = 500;
    let setCookie: string | null = null;
    const withCookie = (res: Response) => {
      if (setCookie) res.headers.append("Set-Cookie", setCookie);
      return res;
    };
    try {
      const rate = checkRate(req);
      setCookie = rate.setCookie;
      if (!rate.ok) throw new HttpError(429, "rate_limited");
      const res = await fn(req, { requestId });
      status = res.status;
      return withCookie(res);
    } catch (err) {
      if (err instanceof HttpError) {
        status = err.status;
        return withCookie(json({ error: err.code }, err.status));
      }
      if (err instanceof AiError && err.type === "cap_reached") {
        status = 503;
        return withCookie(json({ error: "service_busy" }, 503));
      }
      status = 502;
      log.error({ requestId, route, errorType: err instanceof AiError ? err.type : "unhandled" });
      return withCookie(json({ error: "generation_failed" }, 502));
    } finally {
      log.info({ requestId, route, status, durationMs: Date.now() - started });
    }
  };
}

/** JSON post: `handle`, then JSON parse and Zod validation before `fn` sees anything. */
export function handler<S extends z.ZodType>(route: string, schema: S, fn: (body: z.infer<S>, ctx: Ctx, req: Request) => Promise<Response>) {
  return handle(route, async (req, ctx) => {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      throw new HttpError(400, "invalid_json");
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new HttpError(400, "invalid_request");
    return fn(parsed.data, ctx, req);
  });
}
