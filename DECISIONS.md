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

*(Empty — populate as the build progresses. Log anything that changes or narrows a requirement, picks between two valid architectural approaches, or resolves one of the open items in CONTEXT.md §15.)*

Suggested format per entry:

```
## <short title> — <date>

**Decision:** ...
**Why:** ...
**Affects:** <files/FRs/ACs touched>
**Alternatives considered:** ...
```
