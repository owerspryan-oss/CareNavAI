import Link from "next/link";
import { LanguagePicker } from "@/components/i18n/LanguagePicker";
import { useUi } from "@/components/i18n/UiProvider";
import { ChevronLeftIcon } from "./icons";
import styles from "./TopBar.module.css";

export interface TopBarProps {
  /** Accessible name for the back chevron, e.g. "Back" or "Back to start". */
  backLabel: string;
  onBack: () => void;
  /** Disables the back chevron (e.g. while a request is in flight). */
  backDisabled?: boolean;
  /** Ask before the wordmark leaves for the start page. Answers live only in this page (guest = stateless). */
  confirmHome?: boolean;
}

/** Translucent top bar: back chevron, centered wordmark (links to the start), language picker (DESIGN_SYSTEM.md §7, AC-27.1). */
export function TopBar({ backLabel, onBack, backDisabled, confirmHome = true }: TopBarProps) {
  const t = useUi().messages.common.topBar;
  return (
    <header className={styles.bar}>
      <button type="button" className={styles.back} onClick={onBack} disabled={backDisabled} aria-label={backLabel}>
        <ChevronLeftIcon className={styles.backIcon} />
      </button>
      <Link
        href="/"
        className={styles.wordmark}
        aria-label={t.home}
        onClick={(e) => {
          if (confirmHome && !window.confirm(t.leaveConfirm)) e.preventDefault();
        }}
      >
        CareNav AI
      </Link>
      <div className={styles.end}>
        <LanguagePicker />
      </div>
    </header>
  );
}
