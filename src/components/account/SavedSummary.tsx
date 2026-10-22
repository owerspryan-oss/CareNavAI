"use client";

import { useRouter } from "next/navigation";
import { ExplainResultView } from "@/components/result/ExplainResultView";
import { ResultView, type OwnWords } from "@/components/result/ResultView";
import type { LanguageNames } from "@/lib/result/view";
import type { UrgentContent } from "@/lib/safety/urgent-content";
import type { SavedResult } from "@/lib/summaries/store";
import { savedLetterSource } from "@/lib/understand/view";

/** No inputs are saved (FR-14), so a reopened summary has no "your own words" to show. */
const NO_OWN_WORDS: OwnWords = {
  sections: { forWhom: [], mainConcern: [], duration: [], frequency: [], changes: [], medicines: [], previousSupport: [], worries: [] },
  followUps: [],
};
const noop = () => {};

/** A saved summary reopened read-only in the same result views (AC-14.3), with its PDF button. */
export function SavedSummary({ result, urgentContent, languages }: { result: SavedResult; urgentContent: UrgentContent; languages: LanguageNames }) {
  const router = useRouter();
  const back = () => router.push("/account");
  if (result.flow === "prepare") {
    const { english, user, userFallback } = result;
    return (
      <ResultView
        result={{ kind: "result", english, user, userFallback }}
        ownWords={NO_OWN_WORDS}
        urgentContent={urgentContent}
        languages={languages}
        onNotQuite={back}
        readOnly
      />
    );
  }
  const { english, user, userFallback } = result;
  return (
    <ExplainResultView
      result={{ kind: "result", english, user, userFallback }}
      confirmedText={savedLetterSource(english)}
      photoUrl={null}
      urgentContent={urgentContent}
      languages={languages}
      outputLanguage={null}
      onOutputLanguage={noop}
      updating={false}
      updateFailed={false}
      onBack={back}
      readOnly
    />
  );
}
