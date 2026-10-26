"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup, type ChoiceOption } from "@/components/ui/ChoiceGroup";
import { TopBar } from "@/components/ui/TopBar";
import { chooseLanguage } from "@/lib/client/language";
import { useUi } from "./UiProvider";
import styles from "./LanguageChooser.module.css";

/** Case- and accent-insensitive text for the filter ("Français" matches "francais"). */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();

/**
 * Every configured language as native radios (keyboard arrows and screen readers work as normal), each by
 * its own name in its own `lang`/`dir`, with the English name underneath. The current interface language
 * (the browser's match, before anything is chosen) is listed first. A filter box narrows the list.
 */
export function LanguageChoices({
  name,
  legend,
  legendHidden,
  value,
  onChange,
  bounded,
}: {
  name: string;
  legend: string;
  legendHidden?: boolean;
  value: string;
  onChange: (code: string) => void;
  /** Inside a form: the list scrolls in a fixed height instead of filling the page. */
  bounded?: boolean;
}) {
  const { options, language, messages } = useUi();
  const t = messages.common.language.chooser;
  const [filter, setFilter] = useState("");
  const ordered = useMemo(() => [...options.filter((o) => o.code === language), ...options.filter((o) => o.code !== language)], [options, language]);
  const shown = useMemo(() => {
    const q = fold(filter.trim());
    return q ? ordered.filter((o) => fold(o.nativeName).includes(q) || fold(o.englishName).includes(q) || o.code.toLowerCase().startsWith(q)) : ordered;
  }, [ordered, filter]);
  const choices: ChoiceOption<string>[] = shown.map((o) => ({
    value: o.code,
    label: o.nativeName,
    lang: o.code,
    dir: o.dir,
    hint: o.englishName !== o.nativeName ? o.englishName : undefined,
    hintLang: "en",
  }));

  return (
    <div className={styles.choices}>
      <div className={styles.filter}>
        <label htmlFor={`${name}-filter`} className={styles.filterLabel}>
          {t.filterLabel}
        </label>
        <input id={`${name}-filter`} className={styles.filterInput} type="search" autoComplete="off" spellCheck={false} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <p className={styles.noMatch} role="status">
        {shown.length === 0 ? t.noMatch : ""}
      </p>
      <div className={bounded ? styles.bounded : undefined}>
        <ChoiceGroup name={name} legend={legend} legendHidden={legendHidden} options={choices} value={value} onChange={onChange} />
      </div>
    </div>
  );
}

/**
 * Before a journey starts, ask which language the person wants (2026-10-25 product-owner request), unless
 * they have already chosen one. Only the start of a journey: no answers exist yet, nothing safety-related
 * is waiting behind it. Choosing sets the preference and the journey opens in that language.
 */
export function LanguageFirst({ needed, children }: { needed: boolean; children: ReactNode }) {
  const { language, messages } = useUi();
  const t = messages.common.language.chooser;
  const router = useRouter();
  const [value, setValue] = useState(language);
  const [pending, startTransition] = useTransition();
  if (!needed) return <>{children}</>;

  return (
    <div className={styles.page}>
      <TopBar backLabel={messages.prepare.actions.backToStart} onBack={() => router.push("/")} confirmHome={false} />
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.title}>{t.title}</h1>
          <p className={styles.lead}>{t.lead}</p>
        </div>
        <LanguageChoices name="first-language" legend={t.listLabel} legendHidden value={value} onChange={setValue} />
      </main>
      <div className={styles.footer}>
        <Button
          variant="primary"
          fullWidth
          trailingChevron
          loading={pending}
          loadingLabel={t.continuing}
          onClick={() =>
            startTransition(async () => {
              await chooseLanguage(value);
              router.refresh();
            })
          }
        >
          {t.continue}
        </Button>
      </div>
    </div>
  );
}
