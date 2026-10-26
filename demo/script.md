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
| 3:05 | Playful mode (cut first if short of time, A8) | live | On the Pidgin explanation (or Marcia's Patois result), tap "Try it in Naijá, for fun" (or "…Patwa…") in the options row. A few seconds of real STYLE output with "This is for fun. Your clinician gets the plain English version."; tap the doctor's tab to show the English unchanged. Not offered on a result with the urgent banner | FR-23 |
| 3:20 | Feedback and close | live | Two-question prompt. The ask: approve the closed pilot | FR-16 |

## Letter design check

- One new medicine with dose and frequency: "Amlodipine 5mg, to be taken once a day in the morning".
- Follow-up blood test "in a few weeks' time".
- **Deliberate gap:** no course length. The explanation must flag it under "Unclear or missing", with "pharmacist" or "clinician" to ask.
- Contains "please let the surgery know", which is routine wording that must not trip the urgent gate.

## Needs review before recording

- Patois wording in `inputs/marcia-prepare.json` and `inputs/red-flag.json`: native speaker.
- Every model output in the take: product owner. Pidgin output: native speaker.
- Playful output (`style.v1.md`): native speaker for Patois and Pidgin, checking it is warm and never mocking. If the take's restyle fails a check, the plain version stays with one line: re-tap, or cut the scene (A8).

## Loading the inputs (demo mode, FR-26)

1. Set `DEMO_MODE=true` in `.env.local` and restart `npm run dev`. With it off (the default), none of the demo inputs reach the browser.
2. On the first screen of either journey, press **Alt+Shift+D** to open the hidden menu, then pick an input. Close it with Escape.
   - Journey 1 (`/prepare`): "Fill in: marcia-prepare" or "Fill in: red-flag". The answers are filled in and you start at step 1.
   - Journey 2 (`/understand`): "Letter photo: gp-letter" sends `letter/gp-letter.png` through the real photo extraction; "Letter text: gp-letter" is the typed fallback.
3. The urgency gate still runs on every answer. The first **Next** screens everything that was filled in, so `red-flag` shows the emergency message straight after step 1.
4. Run `npm run test:urgency` before the take for the pass/fail matrix (AC-26.2).
