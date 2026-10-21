"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDownIcon, GlobeIcon } from "@/components/ui/icons";
import { useUi } from "./UiProvider";
import styles from "./LanguagePicker.module.css";

/** Must match UI_COOKIE in @/lib/i18n/locale (server-only module, so not imported here). */
const COOKIE = "carenav_lang";

/**
 * Interface language picker (FR-27, AC-27.1): every language with an interface file, by its own name.
 * A native <select>, so it is the phone's own picker and works with every screen reader. The choice is
 * a browser cookie only. Switching re-renders the server parts; client state (the person's answers)
 * stays as it is (AC-27.5).
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
          document.cookie = `${COOKIE}=${encodeURIComponent(e.target.value)}; path=/; max-age=31536000; samesite=lax`;
          startTransition(() => router.refresh());
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
