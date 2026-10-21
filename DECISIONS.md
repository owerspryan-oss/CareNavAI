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

## T-09 guided-step UI choices — 2026-10-21

**Decision:** (1) Step 4 "Changes and patterns" isn't optional (AC-21.2 names only steps 5 and 6), so it accepts text *or* an "I haven't noticed any pattern" tick rather than forcing the user to invent something. (2) Step 1 asks for an age band only for "My child" (AC-09.3); "Someone I look after"/"Someone else" get an optional free-text "who are they to you?" label, which is screened like any other free text. (3) Step 3 makes both pickers required, each with an "I'm not sure" option. (4) Optional steps relabel the primary button "Skip this step" while empty instead of adding a second button. (5) Every submit screens *all* unscreened free text in state, not just the current step's, so text edited and then left via Back can't reach Review unscreened. (6) Filled coral/teal button labels are 19px bold (not the 16px/600 `--text-button`) so white-on-coral meets the large-text contrast threshold. (7) Step transitions use the View Transitions API with a `linear()` spring curve (new `--ease-spring-default` token), so no animation library is added.
**Why:** keeps to the AC wording without forcing false answers; keeps the "no unscreened text proceeds" invariant simple; satisfies DESIGN_SYSTEM.md §2's contrast note; avoids a new dependency.
**Affects:** FR-21, FR-09, FR-06, `src/lib/prepare/state.ts`, `src/components/prepare/*`, `src/components/ui/Button.module.css`, `design/tokens.css`.
**Alternatives considered:** making step 4 optional (contradicts AC-21.2); asking an age band for every "someone else" (more friction, not in AC-09.3, flagged to the product owner instead); Motion/Framer Motion for springs (new dependency for one transition).

## Product-owner answers on Journey 1 result — 2026-10-21

**Decision:** (1) Follow-up questions come **before** review (PRD §3.2 order), asked once after the last guided step; their answers appear on review under "Your extra answers" and can be changed there. (2) Active segmented-control tab uses a new `--color-coral-700` (`#C93F2A`, 4.97:1 with white) so small white text passes AA; coral-500/600 stay for large-text buttons. (3) Draft, confidence and English-only notices are merged into one caution banner. (4) English-only notice reworded: "We couldn't make a reliable version in your language this time, so your summary is in English only. Nothing is missing from it, and you can show it to your doctor as it is."
**Why:** product owner's answers on 2026-10-21 (2 was delegated: "whatever you think").
**Affects:** `src/components/prepare/*`, `src/components/ui/SegmentedControl.module.css`, `design/tokens.css`, `DESIGN_SYSTEM.md`, `src/components/result/copy.ts`.
**Alternatives considered:** larger/bolder tab text to meet the 3:1 large-text threshold (would crowd the tab labels at 390px).

## Result layout: list by default, card deck as an option — 2026-10-21

**Decision:** Results stay a scrolling list by default. A toggle ("Go through it one card at a time") switches the user's own version to a swipeable card deck (`src/components/ui/CardDeck.tsx`): spring physics, 1:1 tracking, interruptible, rubber-band ends, flick projection, plus Next/Back buttons, arrow keys and a "2 of 6" counter as equal alternatives; cards scroll internally at large text sizes; cross-fade under reduced motion. The urgent banner and DRAFT label stay pinned outside the deck; "Unclear or missing" and "We couldn't find this" are never only at the back of the deck; the clinician (English) tab and the PDF are always a list. The toggle remembers the choice on that device.
**Why:** product owner accepted the recommendation: a deck helps calm one-at-a-time reading, but as a default it hides safety-relevant sections, slows a clinician scanning the result, and is harder for screen-reader, low-dexterity and large-text users.
**Affects:** `src/components/ui/CardDeck.*`, `src/lib/ui/spring.ts`, both result views (wired once the Journey 2 result lands).
**Alternatives considered:** deck as default (rejected for the reasons above); deck default on the user tab only (offered as a middle ground, not chosen).

## Simplify the result and journey screens — 2026-10-21

**Decision:** Product owner: "the UI is quite noisy… make it as simple as possible." Every requirement stays, but each thing is said once, quietly, and secondary detail is folded away:
- **Results (both journeys):** one-line draft banner; lead sentence removed; one row of quiet text options under the title ("Show my words" / "Show letter's words", "One card at a time", Journey 2 "Change language") replacing a chip on every section, a big language select and a separate deck link. The user's words (AC-01.5) and the letter's words (rule 7 grounding) appear inline under each point when turned on.
- **Empty sections:** not shown as "You skipped this" rows. Journey 1 lists them once under "Not mentioned" ("You didn't mention: medicines, worries."), which still meets AC-01.1. Journey 2 leaves empty sections out, but says plainly when nothing could be grounded.
- **Folded away:** service routes and the full disclaimer fold into two rows at the end (AC-01.3/01.6 content unchanged; the banner carries "not medical advice"). The disabled "Give feedback" placeholder is removed until FR-16 is built.
- **Guided steps:** the draft notice shows on step 1 only. The character counter stays, because AC-06.1 requires it.
- **Journey 2 start:** the provider notice is one visible sentence, with the full static notice one tap away under "More about privacy".
- **Unchanged:** the urgent screen and banner, "Unclear or missing", "We couldn't find this in your letter", the medicine "check these" line, the clinician tab and the PDF.
**Why:** product-owner request. Fewer competing elements helps the target users (low health literacy, second-language readers).
**Affects:** `src/components/result/*`, `src/components/prepare/PrepareFlow.tsx`, `src/components/understand/*`; copy for review in `src/components/result/copy.ts` and `src/components/understand/copy.ts`.
**Alternatives considered:** hiding the character counter until near the limit (contradicts AC-06.1); removing grounding quotes from the UI entirely (rule 7 needs them viewable).

*(Populate further entries as the build progresses. Log anything that changes or narrows a requirement, picks between two valid architectural approaches, or resolves one of the open items in CONTEXT.md §15.)*

Suggested format per entry:

```
## <short title> — <date>

**Decision:** ...
**Why:** ...
**Affects:** <files/FRs/ACs touched>
**Alternatives considered:** ...
```

## Product-owner answers: age band, crisis continue, logo, copy — 2026-10-21

**Decision:** (1) Copy in prompts, `content/` and `copy.ts` files is approved as it stands; native-speaker review of Tier A content is deferred. (2) Step 1 asks "How old are they?" (same DRAFT bands, required) for "Someone else", as well as for "My child", and that band feeds the gate's child thresholds. "Someone I look after" is unchanged. (3) Crisis keeps `continue_after_ack`, "but make it hard to": on the crisis screen the one-tap "I understand, continue" is replaced by a quiet link that opens a static check ("Before you carry on", Samaritans 116 123 repeated, a required "I am not in danger right now" tick, then "Carry on"). Emergency and urgent stay one tap. The check text is static content in every urgent-messages file, and the schema rejects a file whose crisis message lacks it. (4) The supplied logo PNG is already transparent; the real icon replaces the hand-drawn SVG stand-in.
**Why:** product owner's answers, 2026-10-21.
**Affects:** FR-09, FR-05, `src/lib/prepare/state.ts`, `src/components/prepare/*`, `src/components/safety/UrgentGate.*`, `src/lib/content/schemas.ts`, `content/urgent-messages/*`, `src/components/ui/LogoMark.tsx`.
**Alternatives considered:** a timed delay before the crisis button enables (friction without meaning, and hard for screen-reader users); a hold-to-confirm gesture (motor-accessibility cost).
