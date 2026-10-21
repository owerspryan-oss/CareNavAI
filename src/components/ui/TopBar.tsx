import { LanguagePicker } from "@/components/i18n/LanguagePicker";
import { ChevronLeftIcon } from "./icons";
import styles from "./TopBar.module.css";

export interface TopBarProps {
  /** Accessible name for the back chevron, e.g. "Back" or "Back to start". */
  backLabel: string;
  onBack: () => void;
  /** Disables the back chevron (e.g. while a request is in flight). */
  backDisabled?: boolean;
}

/** Translucent top bar: back chevron, centered wordmark, language picker (DESIGN_SYSTEM.md §7, AC-27.1). */
export function TopBar({ backLabel, onBack, backDisabled }: TopBarProps) {
  return (
    <header className={styles.bar}>
      <button type="button" className={styles.back} onClick={onBack} disabled={backDisabled} aria-label={backLabel}>
        <ChevronLeftIcon className={styles.backIcon} />
      </button>
      <p className={styles.wordmark}>CareNav AI</p>
      <div className={styles.end}>
        <LanguagePicker />
      </div>
    </header>
  );
}
