import { useMemo } from "react";
import { useUi } from "@/components/i18n/UiProvider";
import { format, formatList, type UiMessages } from "@/lib/i18n/messages";

/*
 * Result view copy (both journeys). The text lives in content/ui/<language>.json (FR-27, D13);
 * this module only adds the formatted strings. Static, never model text. `explain.notFound` is
 * neutral on purpose and never styled as fact (CLAUDE.md rule 7).
 */

export function makeResultCopy(m: UiMessages["result"], language: string) {
  return {
    ...m,
    weReadThisAs: (lang: string) => format(m.weReadThisAs, { language: lang }),
    youDidntMention: (sections: string[]) =>
      format(m.youDidntMention, { sections: formatList(sections.map((s) => s.toLocaleLowerCase(language)), language) }),
  };
}

export function makeExplainCopy(m: UiMessages["explain"]) {
  return { ...m, byWhen: (when: string) => format(m.byWhen, { when }) };
}

export type ResultCopy = ReturnType<typeof makeResultCopy>;
export type ExplainCopy = ReturnType<typeof makeExplainCopy>;

/** Journey 1 result copy in the current interface language. */
export function useResultCopy(): ResultCopy {
  const { messages, language } = useUi();
  return useMemo(() => makeResultCopy(messages.result, language), [messages, language]);
}

/** Journey 2 result copy in the current interface language. */
export function useExplainCopy(): ExplainCopy {
  const { messages } = useUi();
  return useMemo(() => makeExplainCopy(messages.explain), [messages]);
}
