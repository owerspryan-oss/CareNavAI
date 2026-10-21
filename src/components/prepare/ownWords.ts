import type { AnsweredFollowUp } from "@/lib/prepare/answers";
import type { PrepareState } from "@/lib/prepare/state";
import type { OwnWords } from "@/components/result/ResultView";
import { prepareCopy as c } from "./copy";

/**
 * The user's own words for each result section (AC-01.5), exactly as typed. Picker answers are
 * shown with their on-screen labels. Sections with nothing typed or picked are left out.
 */
export function ownWords(state: PrepareState, followUps: readonly AnsweredFollowUp[]): OwnWords {
  const { structured: s, text: t } = state;
  const typed = (...v: string[]) => v.filter((x) => x.trim() !== "");

  let who: string[] = [];
  if (s.relationship === "parent") who = [c.review.childAge(s.ageBand ? c.who.ageBands[s.ageBand] : "")];
  else if (s.relationship === "self") who = [c.who.options.self];
  else if (s.relationship) who = typed(c.who.options[s.relationship], t.whoLabel);

  return {
    sections: {
      forWhom: who,
      mainConcern: typed(t.concern),
      duration: s.started ? [`${c.review.startedPrefix} ${c.timing.started[s.started]}`] : [],
      frequency: [...(s.pattern ? [`${c.review.patternPrefix} ${c.timing.pattern[s.pattern]}`] : []), ...typed(t.timingNotes)],
      changes: t.changes.trim() ? [t.changes] : s.noPatternNoticed ? [c.review.noPattern] : [],
      medicines: typed(t.medicines),
      previousSupport: typed(t.previousSupport),
      worries: typed(t.worries),
    },
    followUps: followUps.map((f) => ({ question: f.question, answer: f.answer })),
  };
}
