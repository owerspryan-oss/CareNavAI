/*
 * Client calls for the account pages (FR-12/13/14). Never throw: a failure is a short error code that
 * the page maps to static copy, never server text.
 */

export type AccountCall<T = unknown> = { ok: true; body: T } | { ok: false; error: string };

export async function accountCall<T = unknown>(url: string, init: { method?: string; body?: unknown } = {}): Promise<AccountCall<T>> {
  try {
    const res = await fetch(url, {
      method: init.method ?? "POST",
      headers: init.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    if (!res.ok) return { ok: false, error: typeof body?.error === "string" ? body.error : "failed" };
    return { ok: true, body: body as T };
  } catch {
    return { ok: false, error: "failed" };
  }
}

/** A light check before posting; the server validates properly. */
export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
