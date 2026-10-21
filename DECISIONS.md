# DECISIONS.md

Running decisions log for the CareNav AI workspace and build. Newest at the bottom of each section. For the full product/architecture decision history see `CONTEXT.md` §3 (PRD D1–D18) and §3 (v0.3 deltas A1–A10) — this file is for *new* decisions made during workspace setup and the build itself, not a restatement of those.

---

## Workspace setup decisions — 2026-10-21

| # | Decision | Why |
| --- | --- | --- |
| WS-1 | `CareNav_AI_Agreed_Requirements_v0_3.docx` supersedes `CareNav_AI_PRD_and_Architecture_v0.2.md` wherever they conflict; both are superseded by nothing else in the repo. | Explicit instruction from the product owner when commissioning this workspace. |
| WS-2 | The [ponytail](https://github.com/DietrichGebert/ponytail) dead-code-reduction tool is **not installed**. Its approach is documented as a standing rule in `CLAUDE.md` instead. | Not available as a registered Claude Code skill in this environment; installing an unvetted external skill wasn't worth doing before the build has even started. Revisit once the build begins if dead code becomes a real problem. |
| WS-3 | Git was initialised in this repo (`git init`) as part of workspace setup, with a `.gitignore` covering `.env`, `node_modules/`, build output, local SQLite data, and logs. | Requested explicitly; the repo had no VCS history before this. |
| WS-4 | The app will read `OPENAI_API_KEY` from the environment, even though the current `.env` has `OPENAI_API_KEY_SECRET` / `OPENAI_API_KEY_NAME`. The `.env` file should be updated to match when the build starts, not the other way round. | The PRD, requirements doc and all planned code assume `OPENAI_API_KEY`; adapting the app to the existing (likely leftover/unrelated) var names would create a one-off inconsistency with the documented architecture for no benefit. |
| WS-5 | Subagents are scoped **one per epic** (5 total: prepare, understand, language, safety, trust-ops), matching the deck's epic breakdown, rather than by architecture layer. A main orchestrator (the root Claude Code session) sequences build-plan tasks and delegates to them. | Matches how the deck and requirements already organise FRs/NFRs, so subagent scope maps directly onto existing requirement groupings instead of inventing a new split. |
| WS-6 | Subagent definition files were created now, in `.claude/agents/`, even though the CareNav AI app itself is not being built yet. | Explicitly requested — workspace setup should leave the orchestration machinery ready to use the moment building starts. |

---

## Build decisions

## Design system derived from agreed Brand/ mockups — 2026-10-21

**Decision:** Created `DESIGN_SYSTEM.md` + `design/tokens.css` as the canonical visual/interaction system, derived from the four product-owner-approved mockup screens in `Brand/CareNav AI App Walkthrough Screens.png` and the logo in `Brand/CareNav AI Heart Chat Logo.png`. Color tokens were extracted by pixel-sampling those PNGs (via a PowerShell/System.Drawing script, no Figma/export file exists), not re-designed from scratch. Motion/interaction guidance layers the `apple-design` skill on top of the static mockups.
**Why:** the user explicitly asked for a design system to build the UI from, following the agreed designs rather than a freshly invented style.
**Affects:** all future UI work across every epic; `CLAUDE.md` now points to `DESIGN_SYSTEM.md` as required reading before UI tasks.
**Alternatives considered:** waiting for an exact-hex design-tool export before building a tokens file — rejected because it would block UI work with no scheduled source for that export; documented as an open item (DESIGN_SYSTEM.md §10) instead, to be reconciled later if exact values are supplied.

## T-01 scaffold choices — 2026-10-21

**Decision:** Next.js 16.4 (App Router), React 19, Zod 4, OpenAI SDK 7, pino 10, Vitest 5. TypeScript pinned to `~6.0` (not 7.x) because typescript-eslint supports `<6.1`. New env vars not named in CONTEXT.md §11: `SHOW_DRAFT_LABEL` (FR-29 switch, default `true`), `RATE_LIMIT_PER_MINUTE` / `RATE_LIMIT_PER_DAY` (the `RATE_LIMIT_*` placeholder), `LOG_LEVEL`. Model names in `config/models.json` and prices in `config/pricing.json` are **untested/unverified placeholders** — each file says so, pending model evaluation and a pricing-page check. The logger exposes no free-text message argument at all; strings in allowed fields must look like short identifiers or are replaced with `[dropped]`.
**Why:** stable toolchain for a tight deadline; FR-29 needs a config switch; rule 8 is easier to keep if the logger cannot accept content.
**Affects:** `package.json`, `.env.example`, `config/*`, `src/lib/config/*`, `src/lib/log/logger.ts`.
**Alternatives considered:** TypeScript 7 (breaks linting); per-call message strings in logs (rejected — content leak path).

## T-02 database access without an ORM — 2026-10-21

**Decision:** better-sqlite3 with plain numbered SQL migrations (`src/lib/db/migrations/NNN_*.sql`) and a ~30-line runner. No Drizzle/Kysely. New env var `DATABASE_PATH` (default `data/carenav.sqlite`, gitignored).
**Why:** eleven small tables and prepared statements don't need an ORM. Plain SQL is easiest to review and port to Postgres for the pilot.
**Affects:** `src/lib/db/*`, FR-14/15/16 storage.
**Alternatives considered:** Drizzle (CONTEXT.md §4.4 default). Rejected for now as extra surface for no gain at this size; revisit if queries grow.

## Gate and pipeline shape — 2026-10-21

**Decision:** (1) Every rules list (en, jam, pcm, stroke) runs on every input regardless of language hint; child rules also trigger on text mentioning a baby/young child. (2) Gate level order emergency > crisis > urgent > uncertain > clear (emergency-vs-crisis precedence is an open clinical question). (3) Moderation maps flagged self-harm to `crisis` and self-harm score ≥ 0.2 to `uncertain` (DRAFT thresholds). (4) PRD 9.8 English second pass is skipped only when the level is already `emergency`. (5) Generate routes return `{kind:"urgent", gate}` with no AI text when not clear, unless `continue_after_ack` and the request says the user acknowledged; results carry `meta.urgentAcknowledged` for the persistent banner. (6) The derived user version is always produced (simple English even for English input, per AC-01.7); on parity/protected-span failure the result has `user: null` and the UI shows English only with a notice. (7) Grounding fuzziness only tolerates near-identical words and droppable short fillers — never digits, negations or swapped words. (8) New env `MAX_LETTER_CHARS` (6000) since letters are longer than typed answers.
**Why:** fail-closed and "most cautious wins" per CLAUDE.md rules 1-3; code-switching makes per-language rule selection unsafe; fuzzy grounding must never let an invented dose through (rule 7).
**Affects:** `src/lib/safety/*`, `src/lib/ai/pipeline/*`, `src/lib/validate/*`, `src/app/api/*`.
**Alternatives considered:** selecting rule lists by detected language (misses code-switching); character-level fuzzy grounding (let changed doses through in long quotes — caught by tests).

*(Populate further entries as the build progresses. Log anything that changes or narrows a requirement, picks between two valid architectural approaches, or resolves one of the open items in CONTEXT.md §15.)*

Suggested format per entry:

```
## <short title> — <date>

**Decision:** ...
**Why:** ...
**Affects:** <files/FRs/ACs touched>
**Alternatives considered:** ...
```
