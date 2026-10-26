"use client";

import { useSyncExternalStore } from "react";

export type ResultLayout = "list" | "deck";

// A view preference only, never content: safe to keep on the device for guests (CLAUDE.md rule 9).
const KEY = "carenav:resultLayout";
const listeners = new Set<() => void>();
let memory: ResultLayout | null = null; // used when storage is blocked

function read(): ResultLayout {
  try {
    return localStorage.getItem(KEY) === "deck" ? "deck" : "list";
  } catch {
    return memory ?? "list";
  }
}

function write(l: ResultLayout) {
  memory = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    // Not remembered on the device; still applies for this visit.
  }
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** List by default (and on the server); remembers the user's choice on this device (DECISIONS.md, 2026-10-21). */
export function useResultLayout(): [ResultLayout, (l: ResultLayout) => void] {
  return [useSyncExternalStore(subscribe, read, () => "list"), write];
}
