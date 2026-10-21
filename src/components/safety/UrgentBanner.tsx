import type { UrgentMessage } from "@/lib/content/schemas";
import type { NonClearLevel } from "@/lib/safety/urgent-content";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { DraftLabel } from "./DraftLabel";
import { UrgentActions } from "./UrgentActions";
import styles from "./UrgentBanner.module.css";

export interface UrgentBannerProps {
  /** The acknowledged gate level (result `meta.urgentAcknowledged`). */
  level: NonClearLevel;
  /**
   * The static content for that level: `urgentMessageFor(urgentContent, level)` gives exactly this
   * (it maps `uncertain` to the urgent message). Never model text.
   */
  content: Pick<UrgentMessage, "banner" | "actions">;
  /** Language and direction of the static content actually served (from UrgentContent). */
  lang: string;
  dir: "ltr" | "rtl";
  showDraftLabel: boolean;
  draftLabel: string;
  draftLabelLanguage: string;
  draftLabelDir: "ltr" | "rtl";
}

/**
 * Persistent urgent banner (v0.3 A2), pinned at the top of a result after the user acknowledged the
 * urgent message and continued. Static, pre-approved content only; not dismissible.
 */
export function UrgentBanner({ level, content, lang, dir, showDraftLabel, draftLabel, draftLabelLanguage, draftLabelDir }: UrgentBannerProps) {
  return (
    <section className={styles.banner} role="note" data-level={level}>
      {showDraftLabel && <DraftLabel text={draftLabel} lang={draftLabelLanguage} dir={draftLabelDir} className={styles.draft} />}
      <div className={styles.inner} lang={lang} dir={dir}>
        <div className={styles.lead}>
          <AlertTriangleIcon className={styles.icon} />
          <p className={styles.text}>{content.banner}</p>
        </div>
        <UrgentActions actions={content.actions} className={styles.actions} compact />
      </div>
    </section>
  );
}
