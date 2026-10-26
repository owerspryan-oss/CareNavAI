// Security policy for pages and API routes (T-28, CONTEXT.md §13). Pure functions, used by src/proxy.ts.

/**
 * Content Security Policy for HTML pages. Scripts need this request's nonce (Next.js applies it to its
 * own scripts); styles allow inline because React style attributes need it. Photo previews and voice
 * recordings are blob: URLs; the QR code is a data: image. Nothing may frame the app.
 */
export function contentSecurityPolicy(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Headers for every response. Microphone for voice input (FR-07); nothing else. */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "microphone=(self), camera=(), geolocation=(), payment=(), usb=()",
};

/**
 * CSRF guard for state-changing API calls: the browser's Origin (or, if absent, Sec-Fetch-Site) must
 * say this site. Stops another website making a visitor's browser post audio, photos or text to this
 * server (which would also spend its budget). Requests with neither header are non-browser clients.
 */
export function isSameOrigin(headers: Headers, requestUrl: string): boolean {
  const origin = headers.get("origin");
  if (origin) {
    try {
      const host = headers.get("host") ?? new URL(requestUrl).host;
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = headers.get("sec-fetch-site");
  return site === null || site === "same-origin" || site === "none";
}
