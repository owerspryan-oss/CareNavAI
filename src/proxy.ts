import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, isSameOrigin, SECURITY_HEADERS } from "@/lib/security/policy";

/**
 * T-28: security headers on every response, a per-request nonce CSP on pages, and a same-origin check
 * on every state-changing API call (CSRF). Server Functions keep Next.js's own origin check too.
 */
export function proxy(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  if (isApi && request.method !== "GET" && request.method !== "HEAD" && !isSameOrigin(request.headers, request.url)) {
    return withHeaders(NextResponse.json({ error: "forbidden" }, { status: 403 }));
  }
  if (isApi) return withHeaders(NextResponse.next());

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return withHeaders(response);
}

function withHeaders(response: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) response.headers.set(k, v);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
