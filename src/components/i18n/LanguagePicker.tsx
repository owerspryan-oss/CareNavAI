"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDownIcon, GlobeIcon } from "@/components/ui/icons";
import { chooseLanguage } from "@/lib/client/language";
import { useUi } from "./UiProvider";
import styles from "./LanguagePicker.module.css";

/**
 * Interface language picker (FR-27, AC-27.1): every language with an interface file, by its own name.
 * A native <select>, so it is the phone's own picker and works with every screen reader. The choice is
 * the person's language everywhere: the interface cookie, the output language of new results, and the
 * account's language when signed in. Switching re-renders the server parts; client state (the person's
 * answers) stays as it is (AC-27.5).
 */
export function LanguagePicker({ variant = "compact" }: { variant?: "compact" | "full" }) {
  const { language, options, messages } = useUi();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = options.find((o) => o.code === language);

  return (
    <label className={`${styles.picker} ${styles[variant]}`} data-pending={pending || undefined}>
      <GlobeIcon className={styles.icon} />
      <span className={styles.value} lang={language}>
        {current?.nativeName ?? language}
      </span>
      <ChevronDownIcon className={styles.chevron} />
      <select
        className={styles.select}
        aria-label={messages.common.language.label}
        value={language}
        onChange={(e) => {
          const code = e.target.value;
          startTransition(async () => {
            await chooseLanguage(code);
            router.refresh();
          });
        }}
      >
        {options.map((o) => (
          <option key={o.code} value={o.code} lang={o.code} dir={o.dir}>
            {o.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}

/** AC-27.4: shown in the interface language when its file hasn't been checked by a native speaker yet. */
export function UnreviewedNotice({ className }: { className?: string }) {
  const { reviewed, messages } = useUi();
  if (reviewed) return null;
  return <p className={`${styles.notice} ${className ?? ""}`}>{messages.common.language.unreviewedNotice}</p>;
}
