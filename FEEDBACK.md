# FEEDBACK.md

Standing guidance from the product owner about *how* to work in this repository — corrections and confirmations that should persist across sessions. Claude Code should read this before non-trivial work and update it whenever the product owner corrects an approach or explicitly confirms one worked well.

This is distinct from `DECISIONS.md` (decisions about *what* to build) and `CONTEXT.md` (requirements and architecture). This file is about working style and process.

---

## Standing guidance

### Test, validate and verify before showing the user anything — 2026-10-21

Nothing is presented to the user — a UI, a feature, generated content, a document, a script's output — until Claude Code has tested/run it, validated the result against the task's success criteria, and fixed any issues found. "Looks right by inspection" is not enough when it can be actually run or checked.

**Why:** the product owner should never be the first one to discover a bug, broken screen, or wrong output — that's Claude Code's job to catch first, every time, not just when explicitly reminded.
**How to apply:** for code, this means running it (dev server, tests, scripts) and checking real output, not just reading the diff — exactly what the global CLAUDE.md's "UI or frontend changes" rule and "Goal-driven execution" section already require; this entry makes it a hard gate rather than a best-effort habit. For non-code deliverables (generated images, documents, prompts, config/content files), it means re-reading the actual produced artifact against the stated requirements (e.g. non-negotiable engineering rules, acceptance criteria) before calling the task done. If something genuinely can't be verified in this environment (e.g. no browser available to render a UI), say so explicitly rather than claiming it was checked — don't silently skip the gate.



```
### <short title> — <date>

<The rule, stated directly.>

**Why:** <the reason given, often a past incident or strong preference — this lets future-you judge edge cases instead of blindly following the rule.>
**How to apply:** <when/where this kicks in.>
```

## Baseline rules already in force (inherited, not repeated here)

These are already covered by the user's global `CLAUDE.md` and don't need restating per-entry unless this project needs an exception:

- Think before coding: state assumptions, surface tradeoffs, ask when genuinely unclear.
- Simplicity first: minimum code that solves the problem, no speculative abstractions.
- Surgical changes: touch only what the task requires; don't refactor adjacent code.
- Goal-driven execution: turn tasks into verifiable success criteria before looping on them.

For this project specifically, the PRD's own stated working method (CONTEXT.md §14) is binding: one task at a time with its acceptance criteria, tests requested per task, every prompt/static-content file reviewed by the product owner personally, one commit per task with urgency rules/messages committed separately from code.
