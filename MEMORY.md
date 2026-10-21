# MEMORY.md

Running log of what's happened in this repo, for quick orientation at the start of a session. Newest entries at the top. Keep entries short — one or two lines each. This is a project-local log, separate from Claude Code's cross-project memory system.

---

## 2026-10-21 — Build started (branch `build/layer-1`)

- Done: T-01 scaffold/config/logger, T-02 SQLite, T-03 OpenAI wrapper, T-04 schemas, T-05 static content + T-06 redactor/rules (safety subagent), T-07 combiner, T-08 `/api/screen` + re-screen in `/api/summary|explain|followups`, T-10/11/12/14 generation logic, shared validators, T-29 demo assets.
- In progress: T-09 guided step UI (prepare subagent).
- Next: urgent-message UI (safety), result view T-13, Journey 2 UI, T-16 urgency runner, T-15 PDF.
- No `OPENAI_API_KEY` in the cloud container: all model calls are tested with fakes; with no key the gate fails closed to `uncertain` (verified on a prod build). Real-model checks need a local run.
- `.claude/agents/*.md` had an invalid `tools: all` line; removed so subagents start.

## 2026-10-21 — Workspace set up

- Ingested `Context/` (PRD v0.2, Agreed Requirements v0.3, deck, architecture/pipeline diagrams) and created `CONTEXT.md`, `CLAUDE.md`, `DECISIONS.md`, `FEEDBACK.md`, this file, and `.claude/agents/` (orchestrator + 5 epic subagents).
- `git init` done, `.gitignore` added. No commits yet — nothing has been built.
- No CareNav AI application code exists yet. This was a workspace-setup pass only, per explicit instruction.
- Known open item carried forward: `.env` has `OPENAI_API_KEY_SECRET`/`OPENAI_API_KEY_NAME`, app will expect `OPENAI_API_KEY` — needs fixing before the first OpenAI call is wired up.
- Demo deadline: 28 Oct 2026. Build plan layers run 16–25 Oct, freeze 26th, record 27th.
