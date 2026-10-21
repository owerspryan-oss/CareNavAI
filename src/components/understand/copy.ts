import { useMemo } from "react";
import { useUi } from "@/components/i18n/UiProvider";
import { format, formatNumber, type UiMessages } from "@/lib/i18n/messages";

/*
 * Journey 2 interface copy. The text lives in content/ui/<language>.json (FR-27, D13); this module
 * only adds the formatted strings. Static, never model text.
 */

export function makeUnderstandCopy(m: UiMessages["understand"], language: string) {
  const num = (n: number) => formatNumber(n, language);
  return {
    ...m,
    errors: {
      ...m.errors,
      tooLong: (max: number, length: number) => format(m.errors.tooLong, { over: num(length - max), max: num(max) }),
    },
  };
}

export type UnderstandCopy = ReturnType<typeof makeUnderstandCopy>;

/** Journey 2 copy in the current interface language. */
export function useUnderstandCopy(): UnderstandCopy {
  const { messages, language } = useUi();
  return useMemo(() => makeUnderstandCopy(messages.understand, language), [messages, language]);
}
