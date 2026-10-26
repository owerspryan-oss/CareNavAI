import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, isSameOrigin, SECURITY_HEADERS } from "@/lib/security/policy";

// T-28: CSP, headers and the CSRF same-origin check.

const h = (o: Record<string, string>) => new Headers(o);
const URL_ = "http://localhost:3000/api/feedback";

describe("same-origin check (CSRF)", () => {
  it("allows this site and non-browser clients", () => {
    expect(isSameOrigin(h({ origin: "http://localhost:3000", host: "localhost:3000" }), URL_)).toBe(true);
    expect(isSameOrigin(h({ "sec-fetch-site": "same-origin" }), URL_)).toBe(true);
    expect(isSameOrigin(h({}), URL_)).toBe(true);
  });

  it("refuses other sites, look-alike hosts and broken origins", () => {
    expect(isSameOrigin(h({ origin: "https://evil.example", host: "localhost:3000" }), URL_)).toBe(false);
    expect(isSameOrigin(h({ origin: "http://localhost:3000.evil.example", host: "localhost:3000" }), URL_)).toBe(false);
    expect(isSameOrigin(h({ origin: "http://localhost:4000", host: "localhost:3000" }), URL_)).toBe(false);
    expect(isSameOrigin(h({ origin: "null", host: "localhost:3000" }), URL_)).toBe(false);
    expect(isSameOrigin(h({ "sec-fetch-site": "cross-site" }), URL_)).toBe(false);
    expect(isSameOrigin(h({ "sec-fetch-site": "same-site" }), URL_)).toBe(false);
  });
});

describe("content security policy", () => {
  it("needs the nonce for scripts, forbids eval in production, framing and plugins", () => {
    const prod = contentSecurityPolicy("abc", false);
    expect(prod).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(prod).not.toContain("unsafe-eval");
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("connect-src 'self'");
    expect(prod).not.toMatch(/connect-src[^;]*ws:/);
    expect(contentSecurityPolicy("abc", true)).toContain("'unsafe-eval'");
  });

  it("sets the standard hardening headers and only allows the microphone", () => {
    expect(SECURITY_HEADERS).toMatchObject({ "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "no-referrer" });
    expect(SECURITY_HEADERS["Permissions-Policy"]).toMatch(/^microphone=\(self\), camera=\(\)/);
  });
});
