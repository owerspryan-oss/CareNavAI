import type { ReactNode } from "react";
import { CautionIcon, InfoIcon } from "./icons";
import styles from "./Banner.module.css";

export interface BannerProps {
  /**
   * info = teal ("This is a draft to help you prepare"), caution = amber ("please check with a pharmacist").
   * There is deliberately no urgent tone here: urgent banners and their copy belong to epic-safety.
   */
  tone: "info" | "caution";
  children: ReactNode;
}

/** Full-width rounded banner, icon + text (DESIGN_SYSTEM.md §7). Body text is always ink for contrast. */
export function Banner({ tone, children }: BannerProps) {
  const Icon = tone === "info" ? InfoIcon : CautionIcon;
  return (
    <div className={`${styles.banner} ${styles[tone]}`}>
      <Icon className={styles.icon} />
      <p className={styles.text}>{children}</p>
    </div>
  );
}
