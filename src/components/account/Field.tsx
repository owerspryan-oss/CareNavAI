import type { InputHTMLAttributes } from "react";
import styles from "./Account.module.css";

/** A labelled single-line field in the surface-card style of TextArea (DESIGN_SYSTEM.md §7). */
export function Field({ id, label, hint, ...input }: { id: string; label: string; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      <input id={id} className={styles.input} aria-describedby={hint ? `${id}-hint` : undefined} {...input} />
    </div>
  );
}
