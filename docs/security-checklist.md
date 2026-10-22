# Security checklist (T-28, CONTEXT.md §13)

Checked on 2026-10-22 against the local build on `build/layer-1`. "Test" names the automated check that keeps it true.

| Item | Status | How | Test |
| --- | --- | --- | --- |
| Secrets in the environment only | Done | `OPENAI_API_KEY` read via `src/lib/config/env.ts`; `.env*` gitignored; nothing logs config | — |
| Server-side validation and length limits | Done | Zod on every API body; `MAX_TEXT_CHARS`, `MAX_LETTER_CHARS`, `MAX_AUDIO_SECONDS`, `MAX_IMAGE_MB`, PDF body size | route and pipeline tests |
| No raw HTML from model output | Done | React escapes everything; no `dangerouslySetInnerHTML` anywhere; the PDF template escapes every value | grep (0 uses) |
| PDF renderer cannot reach the network | Done | JavaScript off; every request except `data:` aborted; document CSP `default-src 'none'` | `pdf-render.test.ts` |
| CSRF | Done | `src/proxy.ts`: every non-GET `/api/*` call must carry this site's Origin (or `Sec-Fetch-Site: same-origin`); cross-site JSON **and multipart** get 403. Server Functions (clinician form) keep Next.js's own origin check. Device cookie `SameSite=Strict; HttpOnly` | `security-policy.test.ts`; curl checks below |
| Content Security Policy | Done | Per-request nonce for scripts (`'strict-dynamic'`), no `eval` in production, `frame-ancestors 'none'`, `object-src 'none'`, `connect-src 'self'`; Zod runs `jitless` so it never probes `eval` | `security-policy.test.ts`; production walk below |
| Security headers | Done | `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `COOP: same-origin`, `Permissions-Policy` (microphone for voice only) on every response | `security-policy.test.ts` |
| Rate limits and caps | Done | Per-device minute/day limits on every AI route; monthly cost cap; daily session cap after the gate; alerts at 50/80/100% | `rate.test.ts`, `usage-controls.test.ts`, `pipeline.test.ts` |
| Logging allow-list | Done | Logger writes only allow-listed fields and drops free-text-looking values; every `log.*` call in `src/` uses allow-listed keys; no direct `console` writes | `logger.test.ts`, `log-audit.test.ts` |
| Guest statelessness | Done | Guests write only counts: ledger, rate limits, safety-event levels, anonymous feedback answers, PDF refs. Audio and images stay in memory | `feedback-user.test.ts`, route tests |
| Dependency audit | Done | `npm audit --omit=dev`: 0 vulnerabilities (2026-10-22). Repeat before the pilot | — |
| Admin page | Local-only guard | `/admin/usage` answers only requests addressed to localhost; aggregates only. **Not authentication**: before any shared deployment it needs real sign-in (T-23) | `usage-controls.test.ts` |

## Verified by hand (2026-10-22)

- `curl` to `/api/feedback` and `/api/transcribe` with `Origin: https://evil.example`: 403 for JSON, multipart, and `Sec-Fetch-Site: cross-site` without an Origin; same-origin and non-browser calls: 200.
- Production build (`next build && next start`): landing, both journeys including a photo upload and the result, the urgent screen, a language switch, the admin page and the clinician form all ran with **no CSP violations and no console errors**, and the accessibility walk passed on all 24 screens.

## Open before the pilot

- Real authentication for the admin page (T-23) and for registered users.
- HTTPS and `Strict-Transport-Security` (the local build is plain http on localhost).
- Provider data-retention terms check (no owner yet, CONTEXT.md §15).
