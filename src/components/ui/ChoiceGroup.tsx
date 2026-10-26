"use client";

import styles from "./ChoiceGroup.module.css";

export interface ChoiceOption<V extends string> {
  value: V;
  label: string;
  hint?: string;
  /** The label's own language and direction, when it differs from the page (e.g. a language's native name). */
  lang?: string;
  dir?: "ltr" | "rtl";
  /** The hint's own language, when it differs from the page. */
  hintLang?: string;
}

export interface ChoiceGroupProps<V extends string> {
  /** Radio group name; also used to build element ids. */
  name: string;
  legend: string;
  legendHidden?: boolean;
  options: readonly ChoiceOption<V>[];
  value: V | null;
  onChange: (value: V) => void;
  error?: string;
  /** Two columns suit short labels (age bands); one column suits sentences. */
  columns?: 1 | 2;
}

/** Single-choice radio cards built on native radios (keyboard arrows + screen readers work as normal). */
export function ChoiceGroup<V extends string>({
  name,
  legend,
  legendHidden,
  options,
  value,
  onChange,
  error,
  columns = 1,
}: ChoiceGroupProps<V>) {
  const errorId = error ? `${name}-error` : undefined;
  return (
    <fieldset className={styles.group} aria-describedby={errorId} aria-invalid={error ? true : undefined}>
      <legend className={legendHidden ? "sr-only" : styles.legend}>{legend}</legend>
      <div className={styles.options} data-columns={columns}>
        {options.map((o) => {
          const id = `${name}-${o.value}`;
          return (
            <label key={o.value} htmlFor={id} className={styles.option}>
              <input
                id={id}
                className={styles.radio}
                type="radio"
                name={name}
                value={o.value}
                checked={value === o.value}
                onChange={() => onChange(o.value)}
              />
              <span className={styles.text}>
                <span className={styles.label} lang={o.lang} dir={o.dir}>
                  {o.label}
                </span>
                {o.hint && (
                  <span className={styles.hint} lang={o.hintLang}>
                    {o.hint}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
