import styles from "./ProgressStepper.module.css";

export interface ProgressStepperProps {
  /** 1-based current step. */
  current: number;
  total: number;
  /** Visible caption, e.g. "Step 3 of 7". Also the accessible name of the progress bar. */
  label: string;
}

/** Pill segments filled coral up to the current step, with a caption below (DESIGN_SYSTEM.md §7). */
export function ProgressStepper({ current, total, label }: ProgressStepperProps) {
  return (
    <div className={styles.stepper}>
      <div
        className={styles.track}
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={label}
        aria-label={label}
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={styles.segment} data-filled={i < current || undefined} />
        ))}
      </div>
      <p className={styles.caption} aria-hidden="true">
        {label}
      </p>
    </div>
  );
}
