# CONTEXT.md

Master project context for CareNav AI. This is the single source of truth for requirements, architecture and plan. It is generated from the files in `Context/` and is kept in sync with them — if you change a source document, update this file too.

**Precedence when sources conflict (highest wins):**

1. `Context/CareNav_AI_Agreed_Requirements_v0_3.docx` ("v0.3") — the agreed requirements. Supersedes everything else.
2. `Context/CareNav_AI_PRD_and_Architecture_v0.2.md` ("PRD v0.2") — product requirements and architecture. Still load-bearing for anything v0.3 doesn't touch (architecture, schemas, ADRs, repo layout, testing strategy, security).
3. `Context/CareNav AI Deck v2.pptx` — pitch/overview deck. Useful for framing, epics and stakeholder narrative; not a requirements source.
4. `Context/architecture.png`, `Context/pipeline.png` — architecture and request-pipeline diagrams. Match the PRD; unaffected by v0.3.

This is a **local-only build**. Nothing here is deployed or hosted; it runs on a developer machine for a pre-recorded demo on **28 October 2026**, in support of an ask to leadership to approve an 8-week closed pilot.

---

## 1. What we're building

A local Next.js web app with a Node.js/TypeScript backend calling the OpenAI API, that helps a person prepare for an NHS appointment and understand what they were told afterwards. It works in any language, dialect or register. **It never diagnoses, triages or recommends treatment.**

Two user journeys:

1. **Prepare for my appointment** — guided steps → structured summary (plain English + user's language) + questions to ask.
2. **Understand what I was told** — type/speak/photograph a letter or prescription → plain-English explanation, grounded in direct quotes from the source text.

Every input passes a three-layer **safety gate** before anything else happens. See Section 5.

## 2. The five epics (from the deck — used to scope subagents)

| Epic | Covers | Key FRs | Key NFRs |
| --- | --- | --- | --- |
| **1. Prepare for my appointment** | Journey 1 UI, guided steps, follow-ups, on-behalf-of mode, voice input | FR-21, FR-01, FR-22, FR-09, FR-06, FR-07 | NFR-05, 12, 14, 15 |
| **2. Understand what I was told** | Journey 2 UI, photo/letter capture, grounded explanation, PDF | FR-02, FR-08, FR-10 | NFR-02, 15 |
| **3. Language and dialect engine** | Language detection, translation, interface localisation, tiering, playful mode | FR-04, FR-03, FR-27, FR-28, FR-23 | NFR-10, 11 |
| **4. Safety gate** | Rules + LLM classifier + moderation, urgent messaging, draft-not-approved labelling | FR-05, FR-24, FR-29 | NFR-01, 17, 18 |
| **5. Trust, access and operations** | Guest access, accounts, usage/cost controls, admin page, feedback, demo mode | FR-11, FR-12/13, FR-14, FR-15, FR-16, FR-25, FR-26 | NFR-03, 04, 06, 07, 08, 09, 13, 16 |

**Out of scope for this build (deck + PRD agree):** symptom timeline (FR-17), share links (FR-18), social login (FR-19), NHS integration (FR-20), production hosting, real pen-testing/accessibility audit, real clinical sign-off of rules (drafts only, clearly marked).

**Pitch framing (deck):** 42% of working-age adults in England struggle to understand/use everyday health info (PHE/UCL 2015; 61% when numeracy is involved); 1M+ people in England & Wales don't speak English well or at all (ONS 2021: 880k "not well" + 161k "not at all"). Persona **"Marcia"** (58, Jamaican-born, 30+ years in UK, Patois/English) anchors the narrative. The ask: approve an 8-week closed pilot, 30–50 participants via community partners, **£50 hard AI budget cap**. Team: Ryan Owers + Tymon Gyau (+2 open slots).

## 3. Decisions that are fixed (do not relitigate without updating this file)

### From PRD v0.2 decisions log (D1–D18) — still valid except where v0.3 overrides (marked)

| # | Decision |
| --- | --- |
| D1 | Purpose: recorded demo for 28 Oct. All P1 features live in the local build |
| D2 | Build order: three layers, so a recordable demo exists at each stage |
| D3 | Stack: TypeScript end to end — Next.js, SQLite, OpenAI SDK, Zod |
| D4 | Architecture style: a **gated pipeline, not a free-roaming agent**. The urgency gate always runs first. The model has no tools and never chooses the next step |
| D5 | User-language output: default is simple, clear English; non-English input also gets a translation |
| D6 | Dialect output: opt-in playful mode, off by default — **see v0.3 A5, which makes output mode (simple English / dialect output / translation) a per-language setting, not just a playful-mode toggle** |
| D7 | Pre-appointment flow: fixed guided steps, then up to 3 dynamic follow-up questions |
| D8 | Urgent behaviour: **SUPERSEDED by v0.3 A2** — default is now `continue_after_ack`, not `locked` (see Section 4) |
| D9 | Tier A languages: **SUPERSEDED by v0.3 A4** (see Section 4) |
| D10 | Builder: one engineer working with Claude Code |
| D11 | Deliverables: Markdown (build source) + Word (leadership copy) |
| D12 | Language tiers A/B/C definitions (tier logic unchanged by v0.3, only membership changed) |
| D13 | Interface localisation: translated once into stored files, reviewed by native speakers, not translated at run time; language picker defaults from browser language |
| D14 | Chinese: Mandarin Simplified, Cantonese Traditional (standard written Chinese, not colloquial), output script follows input script |
| D15 | Panjabi: both Gurmukhi and Shahmukhi, output script follows input script |
| D16 | Demo casting: **SUPERSEDED by v0.3 A6** — letter scene is now Pidgin, not Somali |
| D17 | Native-speaker review arranged by product owner, needed before Mon 26 Oct |
| D18 | Reviewer access to outputs deferred to pilot; local build stores nothing for guests |

**Guardrails (PRD 2.1, still in force):** playful mode never touches urgent messages/medicine names/doses/dates/English version/PDF; follow-ups are clarity-only, never clinical probing; urgency check runs on every free-text step and again on the combined input; urgent messages and service routes are static pre-approved content, never model-generated; dialect/register never changes the English clinician version; a language is Tier A only after sign-off (otherwise it runs as Tier B with a double-check notice); languages without a hand-written rules list get extra gate caution.

### v0.3 deltas (Agreed Requirements) — these win over the PRD

| # | Delta | Supersedes |
| --- | --- | --- |
| **A2** | **Default `URGENT_MODE` is now `continue_after_ack`**, not `locked`. User sees the static urgent message, taps "I understand", continues with a persistent urgent banner on the result and PDF. Applies even to self-harm/crisis wording (pending clinical adviser confirmation). `locked` becomes the fallback/configurable setting. | D8, FR-24, AC-05.2, AC-05.6 |
| **A1 / new AC-05.9** | Letters containing urgent wording (even routine phrasing like "urgent referral") show the static urgent message plus the quoted letter wording; explanation is allowed to proceed after acknowledgement. | — |
| **A4** | **Tier A target list replaced**: Jamaican Patois, Nigerian Pidgin, Twi, Hindi, Haitian Creole, Sierra Leonean Krio, Guyanese Creole, Trinidadian Creole (8 languages). Somali, Polish, Urdu, Panjabi, Mandarin, Cantonese, Bengali move to **Tier B**. | D9, PRD Appendix E Tier A table |
| **A5 / new AC-28.6** | Output mode is a **per-language setting**: `simple_english` \| `dialect_output` \| `translation`. Initial mapping — Pidgin = `dialect_output` ON; Patois/Krio/Guyanese/Trinidadian = `simple_english`; Twi/Haitian Creole/Hindi = `translation`. | D6 (narrows playful-mode scope into a general per-language mode) |
| **A6** | Demo letter scene: English GP letter photographed, explained in **Pidgin** (not Somali). | D16, Appendix C demo script |
| **A8** | Cut order if time runs short: 1st playful mode → 2nd voice input → 3rd accounts/saved history → 4th extra unsigned languages. **Never cut:** urgency gate, guest access, photo input, Pidgin dialect output. | — |
| **A10 / new FR-29** | "DRAFT, NOT CLINICALLY APPROVED" label is **on by default** on every urgency-rules / urgent-message screen; switchable off via config for the recording only, no video caption claims safety. | — |
| New ACs | AC-01.7 (user-language pre-appointment version restyles the clinician content in friendlier first-person wording, is **not** independently generated from scratch), AC-02.6/02.7, AC-03.6, AC-08.6 (letter photo shown beside result, browser-only, never persisted), AC-04.2 (per-language output mode), AC-28.5/28.6 (output-mode registry fields). | — |
| NFRs | Renumbered NFR-01..18, same substance as the PRD table, reworded. NFR-16 "Configurability" and NFR-17 "Observability" made explicit. | PRD §6 table |

**Open items (v0.3 §10, trimmed from PRD's 12 to the still-live ones):** clinical adviser not yet engaged (blocks real sign-off of rules and the `continue_after_ack` extension to self-harm cases); AI provider data-retention/training terms check has **no owner**; MHRA medical-device classification undecided. Treat any output that depends on these as provisional/demo-only.

## 4. Architecture

### 4.1 Shape

One Next.js app. Stateless for guests — the server screens, calls OpenAI, validates, returns, and keeps nothing. Registered users get encrypted saved summaries in SQLite.

**Design principles (PRD 8.2):**

1. A **pipeline, not an agent** — the step sequence is fixed in code; the model has no tools and never decides what runs next. This is what guarantees the urgency gate always runs first.
2. Safety is enforced **on the server**, not just hidden in the UI. Every generate endpoint re-screens its own input.
3. **Fail closed** — any error in safety screening becomes `uncertain`, which routes up.
4. Urgent messages, service routes and disclaimers are **static, pre-approved content files**; the model never writes them.
5. **Structured outputs everywhere** — every model call returns schema-validated JSON; free-form model text is never rendered directly.
6. Deterministic checks (grounding, number/medicine matching, schema parity) run **in code**, not by asking another model.
7. Model names/prices/limits are **configuration**, not hard-coded.
8. **No content in logs, ever.**

### 4.2 Request pipeline (see `Context/pipeline.png`)

```
User input (typed / transcript / confirmed OCR text)
  → Validate & limit (size, rate, spend, schema)
  → Redact identifiers (NHS no., phone, email, postcode)
  → [Gate layer 1: rules] + [Gate layer 2: LLM classifier] + [Gate layer 3: moderation]  (parallel)
  → Combine: take the MOST CAUTIOUS result. uncertain/error = route up.
       ├─ emergency / urgent / crisis / uncertain → STATIC urgent message (pre-approved, pre-translated).
       │    Default mode (v0.3 A2): show message → user acknowledges → continue, urgent banner stays on result + PDF.
       │    Fallback mode: locked, journey stops, only "Start again".
       └─ clear → Dynamic follow-ups (max 3, clarity only, skippable, answers re-screened)
                → Generate English master (structured schema)
                → Derive user-language version (if non-English input or user choice; per-language output mode per v0.3 A5)
                → Validators (schema parity, grounding quotes, medicine/number/date checks, protected-span checks)
                → Result: user version + English version + confidence notice + source text shown
                     ├─ optional playful/dialect restyle (user-facing text only, protected spans locked)
                     └─ PDF (always plain) / save (registered) / feedback prompt
```

### 4.3 Components (see `Context/architecture.png`)

| Component | Responsibility | Serves |
| --- | --- | --- |
| Guided step UI | Journeys 1 & 2, progress, review, accessibility | FR-21, FR-06, FR-09 |
| Media capture | Voice recorder, photo capture, in-browser image resize | FR-07, FR-08 |
| Result view | Side-by-side user/English versions, source text, highlights, confidence notice, dialect/playful toggle, feedback prompt | FR-01–04, FR-16, FR-23 |
| Cost & rate guard | Input limits, per-device rate limits, spend ledger, cap check before every AI call | FR-15 |
| **Safety gate** | Rules + LLM classifier + moderation + combiner. Returns a level and static message. Runs before anything else | FR-05, FR-24, FR-29 |
| AI pipeline | Follow-ups, English master, translation, restyle, extraction, transcription | FR-01–04, FR-07, FR-08, FR-22, FR-23 |
| Validators | Schema parity, grounding quotes, number/medicine checks, protected spans | FR-02, FR-03, FR-23 |
| PDF service | Server-rendered bilingual PDF with QR code | FR-10 |
| Auth | Password, magic link, sessions, invites | FR-12, FR-13 |
| Storage | SQLite — users, encrypted summaries, ledger, feedback, safety events | FR-14–16 |
| Static content | Urgent messages, service routes, disclaimers, per-language settings | FR-01, FR-05 |

### 4.4 Technology choices

| Layer | Choice | Reason |
| --- | --- | --- |
| Language/framework | TypeScript, Next.js (App Router), React | One language; shared types across UI/API/schemas |
| Validation/schemas | Zod | Drives OpenAI structured output, server validation and TS types from one definition |
| AI | Official OpenAI Node SDK, Responses API | Structured outputs, image input, `store: false` |
| Database | SQLite via better-sqlite3 + Drizzle (or Kysely) | No setup; schema moves to Postgres for the pilot |
| Encryption | Node `crypto`, AES-256-GCM | Standard, no extra dependency |
| Passwords | argon2id (or bcrypt) | Meets requirement |
| PDF | Playwright + headless Chromium, from an HTML template | Correct text shaping, RTL support (ADR-008) |
| QR codes | `qrcode` package | Simple, offline |
| Tests | Vitest (unit), Playwright (e2e), custom urgency runner | Covers each risk area |
| Logging | pino with an allow-list of fields | Makes "no content in logs" enforceable |

### 4.5 Architecture Decision Records (PRD Appendix D — still valid)

| ADR | Decision |
| --- | --- |
| 001 | Gated pipeline, not an agent |
| 002 | Next.js/TypeScript monolith |
| 003 | Stateless guest server; client holds in-progress state |
| 004 | Static urgent messages/service routes, never model-generated |
| 005 | English master generated first; translations derived from it |
| 006 | Responses API, `store: false`, strict structured outputs |
| 007 | SQLite + app-level encryption (AES-256-GCM) |
| 008 | PDF via headless Chromium (Playwright) for RTL/complex scripts |
| 009 | Vision model reads photos directly, no on-device OCR (revisit for pilot) |
| 010 | Playful/dialect mode isolated, opt-in, never in the PDF |
| 011 | Deterministic code validators after the model, not a second LLM judge |
| 012 | Interface text translated once into reviewable files, not at runtime |
| 013 | Language tier derived from registry sign-off flags, never hand-edited |
| 014 | Extra gate caution for languages without a hand-written rules list |

## 5. Safety gate (the core of the system — PRD §9, unchanged by v0.3 except urgent-mode default)

Three layers run **in parallel** on redacted text; the combiner takes the **most cautious** result.

| Layer | What it does | Weakness |
| --- | --- | --- |
| 1. Rules | Pattern lists per language in `content/urgency-rules/*.json`, plus stroke/child patterns | No context understanding |
| 2. LLM classifier | Strong model returns level, categories, language, register (structured output) | Can miss things in low-resource languages |
| 3. Moderation | OpenAI moderation endpoint for self-harm signals | Not designed for health triage; extra signal only |

Levels: `emergency`, `urgent`, `crisis`, `uncertain` (treated as `urgent`), `clear`. **Every error path returns `uncertain`.**

Extra caution for languages without a rules list (PRD 9.8 / ADR-014): stricter threshold (a "possible" signal → `uncertain`), a second classifier pass on an English rendering (higher result wins), and the language is recorded in urgent-event counts.

Prompt injection: user text/transcripts/letters are **data, not instructions**, wrapped in delimited blocks. Models have no tools, no browsing, no actions. Output is schema-validated.

## 6. Schemas, follow-ups and validators (PRD §11)

- **Pre-appointment schema** (`forWhom`, `mainConcern`, `duration`, `frequencyAndPattern`, `changesAndTriggers`, `medicationAndSupport`, `worriesAndBarriers`, `questionsToAsk`, `whatToBring`, `notMentioned`, `serviceRoutes` [static], `disclaimer` [static], `meta`).
- **Post-appointment schema** (`whatYouWereTold[]` with `sourceQuote`, `whatItMeans[]`, `nextSteps[]` with `sourceQuote`, `medicines[]` with `sourceQuote`, `unclearOrMissing[]`, `ungrounded[]`, `disclaimer`, `meta`). `byWhen` repeats the clinician's own wording — no date math in this build.
- **Allowed follow-up intents** (max 3, each <20 words, clarity-only, never a new symptom or severity): pre-appointment — `clarify_duration`, `clarify_frequency`, `clarify_change`, `clarify_medicines`, `clarify_previous_support`, `clarify_impact_on_daily_life`, `clarify_wording`; post-appointment — `clarify_unclear_term`, `clarify_missing_dose`, `clarify_missing_date`, `clarify_who_to_contact`, `clarify_wording`.
- **Validators (run in code, after the model):** schema match, schema parity (translation keys/lengths match English master), grounding (every `sourceQuote` found in the confirmed source text, normalised, fuzzy-tolerant, ≥3 words), number/dose/date check (must appear in source or becomes `unclearOrMissing`), protected-span check (medicine names/doses/numbers/dates identical across translation/restyle), medicine highlighting, forbidden-content scan (e.g. "you have", "you should take", "this means you are").
- **Prompt contracts:** versioned Markdown files in `src/lib/ai/prompts/`, each output records its `promptVersion`. Every prompt: static rules → tone → schema description → delimited user data last (also helps provider prompt caching).

## 7. Data, privacy, auth (PRD §12)

- **Guests:** nothing stored server-side; typed text/transcripts/extracted text held in the browser only. Audio and images are **never** stored, guest or registered. Provider processing is disclosed before first use.
- **Registered:** summaries stored encrypted (AES-256-GCM, unique IV, `key_version` for rotation), labelled `for_whom`/`is_child`.
- **Tables:** `users`, `magic_links`, `sessions`, `invites`, `summaries`, `usage_ledger`, `rate_limits`, `safety_events`, `feedback_user`, `pdf_exports`, `clinician_feedback`. None of these store user content except `summaries.payload_enc` (encrypted) for registered users.
- **Auth:** argon2id/bcrypt passwords; magic links single-use, 15 min expiry, hash-only storage; sessions via random ID in Secure/HttpOnly/SameSite cookie, hash-only storage; invites via `PILOT_INVITE_REQUIRED`.
- **User rights:** one-action delete (removes user, sessions, magic links, summaries) and export.

## 8. API surface (PRD §13)

| Route | Purpose | Calls |
| --- | --- | --- |
| `POST /api/screen` | Screen one text → level, static message key, language, register | Rules, `GATE`, `MODERATION` |
| `POST /api/followups` | Up to 3 clarity questions | `DRAFT` |
| `POST /api/summary` | Journey 1 result (re-screens combined input first) | `GATE`, `DRAFT`, `TRANSLATE` |
| `POST /api/explain` | Journey 2 result (re-screens, grounds, translates) | `GATE`, `DRAFT`, `TRANSLATE` |
| `POST /api/restyle` | Dialect/playful mode for allowed fields | `STYLE` |
| `POST /api/transcribe` (multipart) | Audio → text | `STT` |
| `POST /api/extract` (multipart) | Image → text + medicine candidates | `VISION` |
| `POST /api/pdf` | Bilingual PDF + QR, writes `pdf_exports` | — |
| `POST /api/feedback` | Anonymous user feedback | — |
| `GET/POST /c/[ref]` | Clinician feedback form | — |
| `/api/auth/{register,login,magic/request,magic/verify,logout,me}` | Accounts | — |
| `GET/POST/DELETE /api/summaries` | List/save/delete (session auth) | — |

All routes: Zod validation, size/rate limits checked first, no content in logs.

## 9. Model roles (config, not hard-coded — `config/models.json`)

| Role | Used for |
| --- | --- |
| `GATE` | Urgency classifier (strongest available text model — mistakes matter most) |
| `DRAFT` | Follow-ups, English master summary, post-appointment explanation |
| `TRANSLATE` | User-language version (test Somali/Panjabi/Bengali/Cantonese specifically — weaker low-resource languages) |
| `STYLE` | Playful/dialect restyle |
| `STT` | Speech to text (test patois/pidgin and code-switching) |
| `VISION` | Letter/prescription extraction |
| `MODERATION` | Self-harm signal |

API rules: Responses API with `store: false` on every call; structured outputs (strict JSON schema from Zod) on every call; static content first in every prompt, variable user content last (enables provider prompt caching); timeout + one retry (gate failure → `uncertain`, generation failure → friendly error); never send identifiers (redact first); no request/response bodies in logs.

## 10. Repo layout (planned — not yet scaffolded)

```
carenav/
  config/              models.json, pricing.json, languages.json
  content/
    urgent-messages/    one file per language
    urgency-rules/       one file per language
    service-routes/
    disclaimers/
    ui/                  interface locale files
  scripts/
    translate-ui.ts
    export-review.ts
    import-review.ts
    run-urgency-tests.ts
  src/
    app/
      prepare/ understand/ result/ account/ c/[ref]/ admin/usage/ dev/inbox/
      api/
        screen/ followups/ summary/ explain/ restyle/ transcribe/ extract/ pdf/ feedback/
        auth/*  summaries/  account/*
    lib/
      ai/            client.ts  prompts/  schemas/  pipeline/  cost/
      safety/        rules.ts  classifier.ts  moderation.ts  combine.ts  redact.ts
      validate/      grounding.ts  numbers.ts  parity.ts  spans.ts  forbidden.ts
      auth/  db/  crypto/  pdf/  limits/  log/
  tests/
    urgency/ grounding/ privacy/ e2e/
  demo/
    inputs/ letter/ script.md
  data/                 SQLite — gitignored
```

## 11. Environment variables (planned — `.env` does not yet match this; see DECISIONS.md)

| Var | Purpose | Default |
| --- | --- | --- |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `URGENT_MODE` | `locked` \| `continue_after_ack` | **`continue_after_ack`** (v0.3 A2) |
| `MONTHLY_CAP_GBP` | Hard spend cap | 50 |
| `DAILY_SESSION_CAP` | Per-day session limit | — |
| `RATE_LIMIT_*` | Per-device rate limits | — |
| `MAX_TEXT_CHARS` | Free-text length limit | 2000 |
| `MAX_AUDIO_SECONDS` | Voice recording limit | 90 |
| `MAX_IMAGE_PX` | Image resize max dimension | 1600 |
| `MAX_IMAGE_MB` | Image upload size limit | — |
| `DATA_KEY` | 32-byte key for AES-256-GCM | — |
| `PILOT_INVITE_REQUIRED` | Gate registration behind invite codes | false (local) |
| `PUBLIC_BASE_URL` | Base URL for links/QR codes | `http://localhost:3000` |
| `CHILD_AGE_BANDS_STRICT` | Stricter child urgency thresholds | — |
| *(TBD)* | Tier A target language list override (v0.3 A4 implies an env/config var; exact name not yet specified) | — |
| *(TBD)* | Per-language output-mode override (v0.3 A5/AC-28.6) | — |

## 12. Testing strategy (PRD §14)

Urgency test set (multi-language, child/crisis/injection cases, automated pass/fail matrix via `run-urgency-tests`), follow-up tests, grounding tests, schema-parity tests, protected-span tests, cost tests, privacy tests (no content in logs/DB for guests), accessibility tests (axe + manual screen reader pass), e2e tests, native-speaker review log. **Pass bar:** zero missed must-route-up urgency case; grounding catches every planted invented item; demo runs clean three times in a row.

Seed urgency scenarios (Appendix B): 23 scenarios (U-01–U-23) across English/Patois/Pidgin/Polish/Somali/Hindi/Mandarin/Cantonese/Urdu/Panjabi (both scripts)/Bengali — emergency/crisis/child/negative-control/injection-attack cases. Minimum per language: ≥8 scenarios (3 emergency, 1 crisis, 1 child, 2 negative control, 1 ambiguous).

## 13. Security & operations (PRD §15)

Secrets env-only; server-side input validation and length limits; no raw HTML rendering of model output; PDF renderer blocks outbound network; CSRF via SameSite + Origin check; CSP and security headers; rate limits; dependency audit before the pilot. **Logging allow-list only**: request id, route, step, status, duration, model role, token counts, safety level, language code, error type — never content or IPs. Performance target: <10s for 95th percentile of typed-summary requests.

**Local → pilot mapping:** SQLite → Postgres; `DATA_KEY` → managed KMS; dev inbox → real email; local ledger → ledger + provider-side cap; draft urgency rules → adviser-approved versioned rules.

## 14. Build plan (PRD §16 — task shape still useful; cut order/language list superseded by v0.3 A8/A4)

Three layers + freeze + record + present:

- **Layer 1 (Core):** Fri 16 – Tue 20 Oct 2026
- **Layer 2 (Media, carers, languages):** Wed 21 – Fri 23 Oct 2026
- **Layer 3 (Product — accounts, usage controls, feedback):** Sat 24 – Sun 25 Oct 2026
- **Freeze:** Mon 26 Oct 2026
- **Record:** Tue 27 Oct 2026
- **Present:** Wed 28 Oct 2026

~35 numbered tasks (T-01..T-35) in the PRD, with sizes/requirements/done-criteria — useful as a scaffolding reference, but re-sequence against v0.3's cut order (A8) and language list (A4) before using task-by-task.

**Working method the PRD specifies (§16.3) — carried into CLAUDE.md:** work one task at a time with its acceptance criteria handed to Claude Code; request tests per task; the product owner reviews every prompt and every static content file personally; commit per task, with urgency rules and urgent messages in their own commits.

## 15. Open questions still unresolved (v0.3 §10, trimmed from PRD's 12)

1. Clinical adviser not yet engaged — blocks real sign-off of urgency rules and blocks extending `continue_after_ack` to self-harm/crisis cases with confidence.
2. OpenAI data-retention/training terms check — **has no owner**.
3. MHRA medical-device classification — undecided.

Treat any build decision that depends on these as **provisional and demo-only**, and flag it rather than treating it as settled.

## 16. Demo script (PRD Appendix C, letter scene updated by v0.3 A6)

~3–4 minute run: patois input → clean summary (English + simple English) in ~1 minute → a second-language input (bilingual result, interface language switch) → a red-flag input stops everything with the urgent message first → an English GP letter is photographed and explained in **Pidgin** (not Somali — v0.3 A6) with medicines highlighted and gaps flagged → PDF + QR code shown → optionally a few seconds of dialect/playful mode, clearly labelled.

## 17. Language registry starting point (PRD Appendix E, Tier A replaced by v0.3 A4)

- **Tier A target (v0.3 A4):** Jamaican Patois, Nigerian Pidgin, Twi, Hindi, Haitian Creole, Sierra Leonean Krio, Guyanese Creole, Trinidadian Creole.
- **Tier B starter list:** Somali, Polish, Urdu, Panjabi (both scripts), Mandarin, Cantonese, Bengali (demoted from Tier A by v0.3), plus Romanian, Portuguese, Spanish, Italian, French, Turkish, Lithuanian, Albanian, Bulgarian, Russian, Ukrainian, Arabic, Farsi, Pashto, Sorani Kurdish, Gujarati, Tamil, Telugu, Malayalam, Nepali, Tigrinya, Amharic, Yoruba, Igbo, Swahili, Vietnamese, Tagalog.
- **Tier C:** everything else, English interface, double-check notice shown.
- A language is **Tier A** only when: interface reviewed, urgent messages reviewed, rules list present, test scenarios passed, speech-to-text tested (or voice disabled), PDF font verified (AC-28.2).

## 18. Working-method rules baked into this workspace

- **Dead-code hygiene is a first-class concern** — see CLAUDE.md for the ponytail-inspired rule (ponytail: github.com/DietrichGebert/ponytail — not installed as a skill here; used as a stated principle, not a tool).
- **Orchestrator + per-epic subagents** — see `.claude/agents/`. The root/orchestrator session sequences build-plan tasks and delegates epic-scoped work to the five epic subagents (Section 2 above). Cross-cutting safety-gate and validator code stays with the orchestrator or the Safety Gate subagent, since every other epic depends on it.
- Every change should trace to a numbered FR/AC — cite it in commits and PRs.
