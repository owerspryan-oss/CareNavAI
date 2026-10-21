# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

CareNav AI — a local-only web app that helps a person prepare for an NHS appointment and understand what they were told afterwards, in any language or dialect, with a safety gate in front of everything. No code exists yet; this workspace is scaffolded with context and conventions so the build can start cleanly. Read **CONTEXT.md first, always** — it is the consolidated, precedence-resolved source of truth for requirements and architecture. Do not re-derive requirements from `Context/*` files directly; `CONTEXT.md` has already resolved conflicts between them (v0.3 requirements doc > PRD v0.2 > deck).

Also read **DECISIONS.md** (why things are the way they are, including workspace-setup decisions), **FEEDBACK.md** (standing guidance from the product owner on how to work in this repo), and **DESIGN_SYSTEM.md** (the agreed visual/interaction system, derived from the approved mockups in `Brand/`) before starting non-trivial work. Any UI task reads `DESIGN_SYSTEM.md` and its companion tokens (`design/tokens.css`) first — don't invent colors, spacing, type, or component shapes ad hoc when a token or component spec already exists for it.

## Non-negotiable engineering rules

These come from the PRD and the agreed requirements and are safety-critical. Do not relax them for convenience, even temporarily.

1. **The urgency gate runs first, always, on every free-text input, and again on the combined input before any generation call.** No code path generates user-facing content without a `clear` gate result first.
2. **Fail closed.** Any error, timeout, or malformed output from a safety-gate layer is treated as `uncertain`, which routes up as if urgent. Never treat a failure as "proceed".
3. **Urgent messages and service routes are static, pre-approved content files.** The model never writes them. Never render AI-generated text in the same view as an urgent message.
4. **Default `URGENT_MODE` is `continue_after_ack`** (v0.3 A2 — this overrides the older PRD default of `locked`). `locked` is the fallback, selected by config only, never a code change.
5. **The English version is the master.** User-language and dialect/playful versions are always derived from it, never the reverse, and never independently generated.
6. **Protected spans (medicine names, doses, numbers, dates) must be byte-identical across translation and restyle.** Reject and fall back to the unstyled version if a check fails, rather than showing a mismatched value.
7. **Every `sourceQuote` in post-appointment output must be grounded** in the confirmed source text (normalised match, ≥3 words). Ungrounded items go to `ungrounded`, never shown as fact.
8. **No user content in logs, ever.** Logging uses an explicit field allow-list (route, step, status, duration, model role, token counts, safety level, language code, error type). Never log request/response bodies, free text, transcripts, or extracted letter text.
9. **Guest sessions are stateless.** Nothing about a guest's input or output is written to disk. Audio and images are never persisted, guest or registered.
10. **Models, prices and limits are configuration** (`config/models.json`, `config/pricing.json`, `config/languages.json`), never hard-coded in application code.
11. **The "DRAFT, NOT CLINICALLY APPROVED" label is on by default** on every urgency-rules/urgent-message screen (v0.3 A10 / FR-29). It can only be switched off via config, for the recording, and never with a claim of clinical safety.
12. Follow-up questions must come from the fixed allowed-intent list (CONTEXT.md §6) and are clarity-only — never a new symptom, severity assessment, or anything that probes toward a diagnosis.

## Dead-code and surgical-change discipline

Keep the codebase lean as it grows — this project is built fast, by one engineer with Claude Code, against a hard deadline, so unused code accumulates easily if not actively removed.

- Before marking a task done, check for code your change made unreachable (old prompt versions superseded by a new one, config keys no longer read, UI branches for a removed flow) and remove it rather than leaving it stranded.
- Prefer the lightest-weight check available: a grep for the symbol/export name across the repo is usually enough to confirm nothing else references it.
- This mirrors the intent of the [ponytail](https://github.com/DietrichGebert/ponytail) dead-code-reduction approach. Ponytail itself is **not installed** as a skill or tool in this environment — treat this section as the standing rule it would otherwise enforce, not as a tool to invoke.
- Still apply the surgical-change rule from the user's global CLAUDE.md: don't refactor or "clean up" adjacent code that isn't part of the current task; only remove dead code that *your own change* just created, unless asked to do a broader sweep.

## Orchestration: one orchestrator, five epic subagents

Build work is split by the deck's five epics (full detail in CONTEXT.md §2). Subagent definitions live in `.claude/agents/`:

| Agent | Scope |
| --- | --- |
| `epic-prepare` | Journey 1 (Prepare for my appointment): guided steps, follow-ups, on-behalf-of mode, voice input |
| `epic-understand` | Journey 2 (Understand what I was told): photo/letter capture, grounded explanation, PDF |
| `epic-language` | Language/dialect engine: detection, translation, interface localisation, tiering, dialect output |
| `epic-safety` | Safety gate: rules, classifier, moderation, combiner, urgent messaging, redaction |
| `epic-trust-ops` | Trust, access, operations: guest/account access, usage controls, admin page, feedback, demo mode |

**How to use them:**

- Work through the build plan in CONTEXT.md §14 one task at a time, each with its acceptance criteria, per the PRD's own stated working method (§16.3, carried into this file). Don't batch unrelated tasks into one pass.
- The root/orchestrator session owns sequencing, cross-cutting concerns that touch more than one epic (shared schemas, shared validators, the request pipeline shape), and anything in `epic-safety`'s territory that other epics depend on — delegate the rest to the matching epic subagent.
- Every epic subagent reads CONTEXT.md and this file for shared rules; its own `.md` file only adds epic-specific scope, file paths and FR/AC references, so the two stay in sync rather than duplicating each other.
- Request tests alongside each task, not after. The urgency test set and grounding tests are the two that must never regress.
- The product owner reviews every prompt file and every static content file (urgent messages, service routes, disclaimers) personally before it's treated as final — don't mark a prompt-authoring task complete without flagging it for that review.
- Commit per task. Urgency rules and urgent-message content get their own commits, separate from code, so they're easy to review and diff in isolation.

## Front-end design language

UI work (mockups, components, motion) follows Apple's interface-design approach, translated for the web — gesture physics, springs, translucent materials, typography discipline, and the eight design principles (purpose, agency, responsibility, familiarity, flexibility, simplicity, craft, delight). The full reference is installed as a project skill at `.claude/skills/apple-design/SKILL.md` — invoke it with `/apple-design` (or let Claude Code auto-load it) before designing or reviewing any screen, component, or interaction, and before writing a design-mockup image prompt. Pair it with the warm, non-clinical tone established for CareNav AI (soft coral/teal accents, rounded friendly typography) rather than Apple's own product branding.

## Environment variables

`.env` in this repo currently holds `OPENAI_API_KEY_SECRET` / `OPENAI_API_KEY_NAME`, which do **not** match what the app will read. The app reads **`OPENAI_API_KEY`** (see CONTEXT.md §11 for the full planned variable list). When wiring up the OpenAI client, read `OPENAI_API_KEY` — don't adapt code to the existing `.env` names; update `.env` itself instead. Never commit `.env` (it's gitignored) and never print its contents.

## Commands

- `npm run dev` — Next.js dev server (http://localhost:3000)
- `npm run build` — production build (also typechecks)
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint (next core-web-vitals + typescript)
- `npm test` — all Vitest tests; single file: `npx vitest run tests/unit/logger.test.ts`
- Copy `.env.example` to `.env.local` for local config. The urgency test runner and Playwright e2e will be recorded here when they exist.
- Next.js 16 differs from older versions — check `node_modules/next/dist/docs/` before using an unfamiliar API (see `AGENTS.md`).
