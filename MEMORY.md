# MEMORY.md

Running log of what's happened in this repo, for quick orientation at the start of a session. Newest entries at the top. Keep entries short — one or two lines each. This is a project-local log, separate from Claude Code's cross-project memory system.

---

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
