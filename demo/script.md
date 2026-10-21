# Demo script (3 to 4 minutes)

All people, inputs and the letter are **fictional** (T-29). The demo shows real model output. Updated for v0.3 A6: the letter scene is explained in **Nigerian Pidgin**, not Somali.

| Time | Scene | Input | What the viewer sees | Requirements |
| --- | --- | --- | --- | --- |
| 0:00 | Opening | none | "Helps people prepare for and understand NHS appointments. Never diagnoses." DRAFT safety label visible | Principles, FR-29 |
| 0:15 | Marcia prepares | `inputs/marcia-prepare.json` (Patois) | Steps 1 to 6, typed (voice for one step if reliable) | FR-06, 07, 21 |
| 0:55 | Follow-ups | live | Two short clarity questions. One answered, one skipped | FR-22 |
| 1:10 | Result | live | Simple English for Marcia and clean English for the clinician, side by side with her own words. PDF and QR | FR-01, 03, 04, 10 |
| 1:35 | Red flag | `inputs/red-flag.json` | The static urgent message appears first, with no AI text. "I understand" continues with the urgent banner (continue_after_ack) | FR-05, 24, 29 |
| 2:00 | Mr Okafor's letter | `letter/gp-letter.txt` (photographed printout) | Letter photographed, extracted text confirmed, Amlodipine 5mg highlighted | FR-08 |
| 2:30 | Explanation | live | Pidgin and English versions: what was said, what it means, next steps, and one flagged gap (no course length) | FR-02, 03, A5/A6 |
| 3:05 | Playful mode (cut first if short of time, A8) | live | A few seconds, opt-in, labelled "for fun", clinician version unchanged | FR-23 |
| 3:20 | Feedback and close | live | Two-question prompt. The ask: approve the closed pilot | FR-16 |

## Letter design check

- One new medicine with dose and frequency: "Amlodipine 5mg, to be taken once a day in the morning".
- Follow-up blood test "in a few weeks' time".
- **Deliberate gap:** no course length. The explanation must flag it under "Unclear or missing", with "pharmacist" or "clinician" to ask.
- Contains "please let the surgery know", which is routine wording that must not trip the urgent gate.

## Needs review before recording

- Patois wording in `inputs/marcia-prepare.json` and `inputs/red-flag.json`: native speaker.
- Every model output in the take: product owner. Pidgin output: native speaker.
