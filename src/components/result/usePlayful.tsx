"use client";

import { useState } from "react";
import { useUiLang } from "@/components/i18n/UiProvider";
import { useResultCopy } from "./copy";
import styles from "./ResultView.module.css";

/*
 * FR-23 playful mode on a result view. Off by default every time the result opens (never remembered),
 * reset when the result changes, and only ever applied to the person's own version on screen: the
 * clinician's English, the PDF body and any saved record keep the plain result (ADR-010).
 */

export type PlayfulStatus = "off" | "loading" | "on" | "failed";

type State<P> = { source: object; status: PlayfulStatus; version: P | null };

/**
 * `source` is the result object (a new one resets to off); `offered` is whether the toggle shows at all;
 * `load` asks the server and lays the playful text over the person's version, or gives null.
 */
export function usePlayful<P>(source: object, offered: boolean, load: () => Promise<P | null>) {
  const [state, setState] = useState<State<P>>({ source, status: "off", version: null });
  const current: State<P> = state.source === source ? state : { source, status: "off", version: null };
  if (state.source !== source) setState(current);

  const toggle = () => {
    if (current.status === "loading") return;
    if (current.status === "on") return setState({ ...current, status: "off" });
    if (current.version) return setState({ ...current, status: "on" });
    setState({ source, status: "loading", version: null });
    void load().then((version) =>
      setState((s) => (s.source !== source ? s : { source, status: version ? "on" : "failed", version })),
    );
  };

  const status: PlayfulStatus = offered ? current.status : "off";
  return { status, version: status === "on" ? current.version : null, toggle };
}

/**
 * One quiet line under the options row: the static "for fun" label while the playful text shows
 * (AC-23.1), or the loading / couldn't-make-it note. A live region, so the change is announced.
 */
export function PlayfulNote({ status }: { status: PlayfulStatus }) {
  const c = useResultCopy();
  const ui = useUiLang();
  const text = status === "on" ? c.playful.label : status === "loading" ? c.playful.loading : status === "failed" ? c.playful.failed : "";
  return (
    <p role="status" aria-live="polite" className={styles.playfulNote} data-status={status} {...ui}>
      {text}
    </p>
  );
}
