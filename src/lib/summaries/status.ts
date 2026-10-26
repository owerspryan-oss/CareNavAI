// Client-safe: what a result response says about auto-saving (FR-14). Absent when nobody is signed in.
export const SAVE_STATUSES = ["saved", "failed", "off"] as const;
export type SaveStatus = (typeof SAVE_STATUSES)[number];
