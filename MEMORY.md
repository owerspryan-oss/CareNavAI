# MEMORY.md

Running log of what's happened in this repo, for quick orientation at the start of a session. Newest entries at the top. Keep entries short — one or two lines each. This is a project-local log, separate from Claude Code's cross-project memory system.

---

## 2026-10-22 — Session 3 progress (branch `build/layer-1`)

**Done:** voice and feedback strings in 43 locales (`d3bc41a`). T-23 accounts (`c4fe5a4`), T-24 encrypted saved summaries (`be69572`). Account copy approved by the product owner and translated into 43 locales (`70ca4d6`). T-27 playful mode for jam/pcm (`6e5b4cc` prompt, `99afba1` code). All locale drafts are `reviewed: false`. 756 unit tests, urgency 70/70, a11y 25/25 (50 with `A11Y_LANGS=en,ur`), build clean.

**Next:** translate the 5 `result.playful.*` strings once the product owner approves them. T-22 Tier A review (native speakers plus a live key). T-30 rehearsal. With a key: try playful mode on real Patois and Pidgin output (the strict span checks may reject it often).

**Waiting on the product owner (in addition to the list below):**
- `src/lib/ai/prompts/style.v1.md` and the `result.playful.*` copy.
- Whether a regenerated result, or a changed output language, should replace the earlier saved entry (it currently saves a new one).
- Translator doubts on the voice and feedback strings: all of Twi; gendered "confident" in it/es/fr/ro/lt/sq/bg; "anonymous" rendered as "no name" in several languages; the voice privacy line in ar, ps, te, ml, pl, es, ru and uk.
- Translator doubts on the account strings: Twi's "saving isn't set up"; "characters" in kri/yo/ig/sw/so; "once, for 15 minutes" in am/ti; masculine "signed in" in pl/fr; mixed button and sentence register in ta/bg/am/ti/tr.

**Gotcha:** set `DATA_KEY` in `.env.local` or saving stays off. Create invite codes with `npm run invite:create`. Restyle is always refused without a key, because the gate fails closed.

## 2026-10-22 — Session handoff (end of build session 2, branch `build/layer-1`)

**State:** all work committed and pushed to `origin/build/layer-1`; no PR, nothing merged to `master`. 699 unit tests pass, `npm run test:urgency` 70/70 (offline), `npm run test:a11y` 24/24 screens (48 with `A11Y_LANGS=en,ur`), production build clean with no CSP violations.

**Done this session (details in DECISIONS.md, newest at the bottom):**
- Product-owner answers: age band for "Someone else"; crisis continue needs a two-step check (also on emergency + self-harm); breathing split (can't breathe = emergency, difficulty = urgent; classifier prompt v2); Samaritans line on emergency + self-harm; NHS 111 interpreter line on crisis; child thresholds kept as built; polite "you" kept in translations; copy approved.
- Real logo (the brand PNG is already transparent).
- T-17 demo mode, T-18 a11y check (automated), T-31/T-32 interface localisation (43 DRAFT locale files + review-sheet scripts), T-20 voice input (hidden until a language has `signoff.sttTested: true`), T-34 bundled PDF fonts + RTL, T-26 user feedback, T-25 session cap + cap alerts + `/admin/usage`, T-28 security pass (`src/proxy.ts`, `docs/security-checklist.md`).

**Next, in order:**
1. Translate the 24 new interface strings (`prepare.voice.*`, `result.feedback.*`) into the 43 locales. They show in English until then. With a key: `node --env-file=.env.local scripts/translate-ui.mjs --all`. Without one: draft them the way session 2 did (agents writing flat JSON checked by `problem()` in `scripts/lib/ui-locales.mjs`, then merged with source hashes via `writeLocale`).
2. T-23/T-24 accounts (password + magic link with a dev inbox, sessions, invites; encrypted saved summaries, list/re-download/delete/export). Tables already exist in `src/lib/db/migrations/001_*.sql`. Cut 3rd under v0.3 A8.
3. T-27 playful mode (cut 1st). T-22 Tier A review needs native speakers and a live key. T-30 rehearsal.

**Waiting on the product owner:** native-speaker review of the interface drafts (`npm run ui:review:export -- <code>`) and of Tier A urgent content; trying voice locally and flipping `sttTested`; review of `translate-ui.v1.md`, the voice disclosure and the feedback card wording.

**Gotchas (add to the ones below):** `next start` runs as `next-server`; stop dev/prod servers by scanning `/proc/*/cmdline` and skipping `$$`, never a chained `pkill -f` whose pattern appears in the same command line. `env()` is cached: tests that stub env must `vi.resetModules()` and re-import. Route files may only export route handlers and config.

## 2026-10-21 — Session handoff (end of build session 1, branch `build/layer-1`, HEAD 9c9f2e3)

**State:** all work committed and pushed to `origin/build/layer-1`. Nothing has been merged to `master` and no PR has been opened. 556 unit tests pass; `npm run test:urgency` reports 0 MISS across 70 scenarios (offline).

**Done:**
- Foundation: T-01 to T-04.
- Static content and the safety gate: T-05, T-06, T-07, T-08.
- Generation logic: T-10, T-11, T-12, T-14 (follow-ups, both English masters, the derived user version, grounding). T-16 urgency runner.
- T-33: DRAFT urgent messages and rules lists for all 8 Tier A languages. The content loaders are file-driven (AC-28.4).
- UI:
  - T-09 Journey 1 guided steps.
  - T-13 Journey 1 result.
  - Journey 2 `/understand`: photo or typed letter → confirm → gate → follow-ups → grounded result, plus the `/api/extract` server side (T-19).
  - The urgent-message screen and persistent banner.
- T-15 bilingual PDF + QR + clinician form `/c/[ref]`.
- T-25 (part): per-device rate limits.
- T-29: demo assets.
- T-28: security pass (`src/proxy.ts` CSP + CSRF + headers; `docs/security-checklist.md`).
- T-25: daily session cap (after the gate), cap alerts in the log, `/admin/usage` (localhost only).
- T-26: anonymous two-question feedback after both results (`/api/feedback`).
- T-34: bundled Noto fonts for every interface script in the PDF, RTL-safe template (`assets/fonts`).
- T-20: voice input (`/api/transcribe`, recorder on guided free-text steps). Hidden until a language has `signoff.sttTested: true`; none do yet. To try: set it for `en`/`jam` locally with a key.
- T-17: demo mode (`DEMO_MODE=true`, Alt+Shift+D menu; see `demo/script.md`).
- T-18 (automated): `npm run test:a11y`, 24 screens axe-clean and no sideways scroll at 200% text (`A11Y_LANGS=en,ur` for 48).
- T-31/T-32: interface localisation. `content/ui/en.json` master plus DRAFT files for all 43 Tier A/B languages, picker in every header, RTL, review-sheet scripts.

**Product-owner decisions this session (all logged in DECISIONS.md):**
- Follow-up questions come before review.
- `--color-coral-700` for small white text.
- Results default to a list; the card deck (`CardDeck`) is an opt-in toggle.
- A simplification pass on all screens: one quiet options row, empty sections collapsed, routes and disclaimer folded away, draft notice on step 1 only.

**Next, roughly in priority order (CONTEXT.md §14; cut order v0.3 A8):**
- T-18 manual screen-reader walk-through of both journeys (automated part done).
- Native-speaker review of the 43 interface drafts (`npm run ui:review:export -- <code>`). Agents flagged: Bengali vs Sylheti, gender slashes (ur, pa, hi, es, it, ro, ru, uk, bg, lt, sq), polite vs informal "you" per language, Arabic number agreement in "too long", Twi/Igbo/Yoruba/Tigrinya/Amharic least certain.
- T-21 on-behalf-of child thresholds UI. Age band for "someone else" done 2026-10-21.
- T-22 Tier A review.
- T-23/T-24 accounts and saved history (cut 3rd).
- T-27 playful mode. Tag restyled output so `/api/pdf` can reject it.
- T-35 is effectively done inside the gate (PRD 9.8 second pass).

**Waiting on the product owner:**
- Copy approved 2026-10-21, including the crisis check and breathing wording. New since: the self-harm line on emergency and the 111 interpreter line on crisis.
- Native-speaker review of the Tier A content. Least confidence: Twi, Krio, Guyanese.
- ~~A transparent logo export.~~ Not needed: the supplied PNG is already transparent; the real icon is now used (public/brand/logo-mark.png).
- Open clinical questions: none from the product owner; all answered 2026-10-21 (see DECISIONS.md). Clinical adviser sign-off is still outstanding for all DRAFT rules and messages.

**Gotchas:**
- There is no `OPENAI_API_KEY` in the cloud container. Model calls are tested with fakes, and the gate fails closed to `uncertain`. Real-model checks need a local `.env.local` with `OPENAI_API_KEY`.
- Playwright: use `require("/opt/node22/lib/node_modules/playwright")` with `executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"`. Its screenshot caret-hiding causes a harmless "1 Issue" hydration notice in the Next dev overlay.
- When stopping dev servers by matching command lines in `/proc`, skip your own shell's PID (`$$`), or the kill loop takes down the shell. Same for `pkill -f`: run it as its own command, never chained. `next start` runs as `next-server` (kill by /proc cmdline, not `pkill -f "next start"`).
- Subagents run in `isolation: "worktree"` may start from `master`. Tell them to `git reset --hard build/layer-1` first.

## 2026-10-21 — Workspace set up

- Ingested `Context/` (PRD v0.2, Agreed Requirements v0.3, deck, architecture/pipeline diagrams) and created `CONTEXT.md`, `CLAUDE.md`, `DECISIONS.md`, `FEEDBACK.md`, this file, and `.claude/agents/` (orchestrator + 5 epic subagents).
- `git init` done, `.gitignore` added. No commits yet — nothing has been built.
- No CareNav AI application code exists yet. This was a workspace-setup pass only, per explicit instruction.
- Known open item carried forward: `.env` has `OPENAI_API_KEY_SECRET`/`OPENAI_API_KEY_NAME`, app will expect `OPENAI_API_KEY` — needs fixing before the first OpenAI call is wired up.
- Demo deadline: 28 Oct 2026. Build plan layers run 16–25 Oct, freeze 26th, record 27th.
