# FEEDBACK.md

Standing guidance from the product owner about *how* to work in this repository — corrections and confirmations that should persist across sessions. Claude Code should read this before non-trivial work and update it whenever the product owner corrects an approach or explicitly confirms one worked well.

This is distinct from `DECISIONS.md` (decisions about *what* to build) and `CONTEXT.md` (requirements and architecture). This file is about working style and process.

---

## Standing guidance

*(Empty — this is a new workspace. Add entries as they come up, in the form below.)*

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
