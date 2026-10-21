"use client";

import { AGE_BANDS, RELATIONSHIPS } from "@/lib/ai/schemas";
import {
  PATTERN_OPTIONS,
  STARTED_OPTIONS,
  asksAgeBand,
  fieldMax,
  type PrepareState,
  type StepErrors,
  type StructuredAnswers,
  type TextField,
} from "@/lib/prepare/state";
import { Checkbox } from "@/components/ui/Checkbox";
import { ChoiceGroup } from "@/components/ui/ChoiceGroup";
import { TextArea } from "@/components/ui/TextArea";
import { usePrepareCopy } from "./copy";
import styles from "./PrepareFlow.module.css";

export interface StepBodyProps {
  state: PrepareState;
  errors: StepErrors;
  maxChars: number;
  /** True while answers are being screened: fields are read-only so the screened text can't drift. */
  locked: boolean;
  setText: (field: TextField, value: string) => void;
  setStructured: (patch: Partial<StructuredAnswers>) => void;
}

function Field({
  field,
  label,
  labelHidden,
  hint,
  placeholder,
  rows,
  ...p
}: StepBodyProps & {
  field: TextField;
  label: string;
  labelHidden?: boolean;
  hint?: string;
  placeholder?: string;
  rows?: number;
}) {
  const c = usePrepareCopy();
  return (
    <TextArea
      id={`prepare-${field}`}
      label={label}
      labelHidden={labelHidden}
      hint={hint}
      placeholder={placeholder}
      rows={rows}
      value={p.state.text[field]}
      onChange={(v) => p.setText(field, v)}
      maxChars={p.maxChars}
      tooLongMessage={c.errors.tooLong}
      error={p.errors[field]}
      readOnly={p.locked}
    />
  );
}

export function WhoStep(p: StepBodyProps) {
  const c = usePrepareCopy();
  const s = p.state.structured;
  return (
    <div className={styles.stack}>
      <ChoiceGroup
        name="relationship"
        legend={c.who.legend}
        legendHidden
        options={RELATIONSHIPS.map((r) => ({ value: r, label: c.who.options[r] }))}
        value={s.relationship}
        onChange={(relationship) => p.setStructured({ relationship })}
        error={p.errors.relationship}
      />
      {asksAgeBand(s.relationship) && (
        <ChoiceGroup
          name="ageBand"
          legend={s.relationship === "parent" ? c.who.ageLegend : c.who.ageLegendOther}
          columns={2}
          options={AGE_BANDS.map((b) => ({ value: b, label: c.who.ageBands[b] }))}
          value={s.ageBand}
          onChange={(ageBand) => p.setStructured({ ageBand })}
          error={p.errors.ageBand}
        />
      )}
      {(s.relationship === "carer" || s.relationship === "other") && (
        <Field {...p} maxChars={fieldMax("whoLabel", p.maxChars)} field="whoLabel" label={c.who.labelLabel} hint={c.who.labelHint} rows={2} />
      )}
    </div>
  );
}

export function ConcernStep(p: StepBodyProps) {
  const c = usePrepareCopy();
  return <Field {...p} field="concern" label={c.concern.label} labelHidden placeholder={c.concern.placeholder} rows={6} />;
}

export function TimingStep(p: StepBodyProps) {
  const c = usePrepareCopy();
  const s = p.state.structured;
  return (
    <div className={styles.stack}>
      <ChoiceGroup
        name="started"
        legend={c.timing.startedLegend}
        options={STARTED_OPTIONS.map((v) => ({ value: v, label: c.timing.started[v] }))}
        value={s.started}
        onChange={(started) => p.setStructured({ started })}
        error={p.errors.started}
      />
      <ChoiceGroup
        name="pattern"
        legend={c.timing.patternLegend}
        options={PATTERN_OPTIONS.map((v) => ({ value: v, label: c.timing.pattern[v] }))}
        value={s.pattern}
        onChange={(pattern) => p.setStructured({ pattern })}
        error={p.errors.pattern}
      />
      <Field {...p} field="timingNotes" label={c.timing.notesLabel} rows={3} />
    </div>
  );
}

export function ChangesStep(p: StepBodyProps) {
  const c = usePrepareCopy();
  return (
    <div className={styles.stack}>
      <Field {...p} field="changes" label={c.changes.label} labelHidden placeholder={c.changes.placeholder} />
      <Checkbox
        id="prepare-no-pattern"
        label={c.changes.nonePattern}
        checked={p.state.structured.noPatternNoticed}
        onChange={(noPatternNoticed) => p.setStructured({ noPatternNoticed })}
      />
    </div>
  );
}

export function MedicinesStep(p: StepBodyProps) {
  const c = usePrepareCopy();
  return (
    <div className={styles.stack}>
      <Field {...p} field="medicines" label={c.medicines.medicinesLabel} hint={c.medicines.medicinesHint} rows={3} />
      <Field {...p} field="previousSupport" label={c.medicines.supportLabel} hint={c.medicines.supportHint} rows={3} />
    </div>
  );
}

export function WorriesStep(p: StepBodyProps) {
  const c = usePrepareCopy();
  return <Field {...p} field="worries" label={c.worries.label} labelHidden placeholder={c.worries.placeholder} />;
}
