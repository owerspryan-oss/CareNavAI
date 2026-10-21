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

**Product-owner decisions this session (all logged in DECISIONS.md):**
- Follow-up questions come before review.
- `--color-coral-700` for small white text.
- Results default to a list; the card deck (`CardDeck`) is an opt-in toggle.
- A simplification pass on all screens: one quiet options row, empty sections collapsed, routes and disclaimer folded away, draft notice on step 1 only.

**Next, roughly in priority order (CONTEXT.md §14; cut order v0.3 A8):**
- T-17 demo mode (fixture loader).
- T-18 accessibility pass (axe).
- T-31/T-32 language picker and interface localisation.
- T-20 voice (cut 2nd).
- T-21 on-behalf-of child thresholds UI. Ask the product owner whether to show an age band for "someone else".
- T-22 Tier A review.
- T-23/T-24 accounts and saved history (cut 3rd).
- T-25 cap alerts and admin usage page.
- T-26 feedback prompt. The "Give feedback" button was removed until this is built.
- T-27 playful mode. Tag restyled output so `/api/pdf` can reject it.
- T-28 security pass.
- T-34 PDF fonts and RTL.
- T-35 is effectively done inside the gate (PRD 9.8 second pass).

**Waiting on the product owner:**
- Copy review: all prompts in `src/lib/ai/prompts/`, everything under `content/`, and the `copy.ts` files under `src/components/*` and `src/lib/pdf/`.
- Native-speaker review of the Tier A content. Least confidence: Twi, Krio, Guyanese.
- A transparent logo export.
- Open clinical questions for the adviser: emergency vs crisis precedence; `continue_after_ack` for crisis; child thresholds and the unknown-age default; breathing difficulty as urgent or emergency; a language-line note for Samaritans.

**Gotchas:**
- There is no `OPENAI_API_KEY` in the cloud container. Model calls are tested with fakes, and the gate fails closed to `uncertain`. Real-model checks need a local `.env.local` with `OPENAI_API_KEY`.
- Playwright: use `require("/opt/node22/lib/node_modules/playwright")` with `executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"`. Its screenshot caret-hiding causes a harmless "1 Issue" hydration notice in the Next dev overlay.
- When stopping dev servers by matching command lines in `/proc`, skip your own shell's PID (`$$`), or the kill loop takes down the shell.
- Subagents run in `isolation: "worktree"` may start from `master`. Tell them to `git reset --hard build/layer-1` first.

## 2026-10-21 — Workspace set up

- Ingested `Context/` (PRD v0.2, Agreed Requirements v0.3, deck, architecture/pipeline diagrams) and created `CONTEXT.md`, `CLAUDE.md`, `DECISIONS.md`, `FEEDBACK.md`, this file, and `.claude/agents/` (orchestrator + 5 epic subagents).
- `git init` done, `.gitignore` added. No commits yet — nothing has been built.
- No CareNav AI application code exists yet. This was a workspace-setup pass only, per explicit instruction.
- Known open item carried forward: `.env` has `OPENAI_API_KEY_SECRET`/`OPENAI_API_KEY_NAME`, app will expect `OPENAI_API_KEY` — needs fixing before the first OpenAI call is wired up.
- Demo deadline: 28 Oct 2026. Build plan layers run 16–25 Oct, freeze 26th, record 27th.
