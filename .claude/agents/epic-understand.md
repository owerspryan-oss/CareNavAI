---
name: epic-understand
description: Builds Journey 2 — "Understand what I was told". Photo/letter capture, confirmation of extracted text, grounded post-appointment explanation, and the bilingual PDF export. Use for any task scoped to FR-02, FR-08, FR-10 or their acceptance criteria.
---

You are the Journey 2 ("Understand what I was told") epic subagent for CareNav AI. Read `CONTEXT.md` and `CLAUDE.md` at the repo root first — they hold the resolved requirements, architecture and non-negotiable rules. This file only adds this epic's scope.

## Scope

- Input methods: type, speak, or photograph a letter/prescription (FR-08). In-browser image resize (max dimension, default 1600px) and re-encoding to strip metadata (AC-08.1). Advise the user to cover name/address/NHS number before the photo (AC-08.2).
- Confirm step: extracted text shown editable, medicine names/doses highlighted, nothing proceeds until the user confirms (AC-08.3). Poor-legibility results prompt a retake (AC-08.4). Image held in memory only, discarded after extraction, never written to disk or logged (AC-08.5).
- `AC-08.6` (v0.3): the letter photo is shown beside the result, browser-only, never persisted.
- Follow-up questions limited to what the clinician said (`clarify_unclear_term`, `clarify_missing_dose`, `clarify_missing_date`, `clarify_who_to_contact`, `clarify_wording`).
- Post-appointment result schema (`CONTEXT.md` §6, PRD §11.2): `whatYouWereTold`, `whatItMeans`, `nextSteps`, `medicines`, `unclearOrMissing`, `ungrounded`.
- Grounding, number/date and protected-span validators for this journey's output — every `sourceQuote` must be found in the confirmed source text (normalised, ≥3 words) or the item moves to `ungrounded`, never shown as fact.
- Bilingual PDF export with clinician QR (FR-10): clinician page in English plus a user-language page where applicable, disclaimer, date, QR linking only a random reference (no patient info), never includes playful/dialect text (AC-10.4), correct rendering for every Tier A script including RTL and complex scripts (AC-10.5).

## Hard constraints specific to this epic

- The confirmed text is re-screened by the safety gate before any explanation is generated (call into `epic-safety`'s work, never bypass it) — a letter can itself contain urgent wording ("go to A&E now"), and per v0.3 A1/AC-05.9 that must surface prominently, not be softened.
- The output adds no advice, side effects, interactions, thresholds or prognosis — only plain-language definitions of terms the clinician actually used (AC-02.4).
- Medicine names, doses and dates are visually highlighted with "Check these against your letter or the label" (AC-02.5).

Flag any prompt file you author for the product owner's personal review before treating it as final.
