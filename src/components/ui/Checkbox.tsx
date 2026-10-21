"use client";

import styles from "./ChoiceGroup.module.css";

export interface CheckboxProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A single tick-box card, styled to match ChoiceGroup options. */
export function Checkbox({ id, label, checked, onChange }: CheckboxProps) {
  return (
    <label htmlFor={id} className={styles.option}>
      <input
        id={id}
        type="checkbox"
        className={`${styles.radio} ${styles.checkbox}`}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.label}>{label}</span>
    </label>
  );
}
