import { AlertTriangleIcon } from "@/components/ui/icons";
import styles from "./DraftLabel.module.css";

/**
 * "DRAFT, NOT CLINICALLY APPROVED" (FR-29 / v0.3 A10). Full-contrast ink on the urgent tint, never
 * animated, translucent or truncated, so it survives large text and any theming experiment.
 * Callers render it only when the server says the label is on.
 */
export function DraftLabel({ text, lang, dir, className }: { text: string; lang: string; dir: "ltr" | "rtl"; className?: string }) {
  return (
    <p className={[styles.label, className].filter(Boolean).join(" ")} lang={lang} dir={dir}>
      <AlertTriangleIcon className={styles.icon} />
      <span>{text}</span>
    </p>
  );
}
