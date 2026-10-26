import { useMemo } from "react";
import { useUi } from "@/components/i18n/UiProvider";
import { format, formatNumber, type UiMessages } from "@/lib/i18n/messages";

/*
 * Journey 1 interface copy. The text lives in content/ui/<language>.json (FR-27, D13); this module
 * only adds the formatted strings. Plainest wording possible (AC-21.3).
 */

export function makePrepareCopy(m: UiMessages["prepare"], language: string) {
  const num = (n: number) => formatNumber(n, language);
  return {
    ...m,
    stepLabel: (n: number, total: number) => format(m.stepLabel, { n: num(n), total: num(total) }),
    review: {
      ...m.review,
      childAge: (band: string) => format(m.review.childAge, { band }),
      otherAge: (band: string) => format(m.review.otherAge, { band }),
    },
    errors: {
      ...m.errors,
      tooLong: (max: number, length: number) => format(m.errors.tooLong, { over: num(length - max), max: num(max) }),
    },
  };
}

export type PrepareCopy = ReturnType<typeof makePrepareCopy>;

/** Journey 1 copy in the current interface language. */
export function usePrepareCopy(): PrepareCopy {
  const { messages, language } = useUi();
  return useMemo(() => makePrepareCopy(messages.prepare, language), [messages, language]);
}
