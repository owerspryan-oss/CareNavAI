import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../content/ui/en.json";
import {
  PROGRESS_INTERVAL_MS,
  changeLanguageLines,
  explainLines,
  outputLanguageName,
  runSequence,
  summaryLines,
} from "@/components/ui/progress";
import type { LanguageNames } from "@/lib/result/view";

const p = en.messages.common.progress;
const languages: LanguageNames = {
  en: { englishName: "English", nativeName: "English", dir: "ltr" },
  ur: { englishName: "Urdu", nativeName: "اردو", dir: "rtl" },
  pcm: { englishName: "Nigerian Pidgin", nativeName: "Naijá", dir: "ltr" },
};

describe("runSequence", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("advances one line per interval and stops on the last, never looping back", () => {
    const seen: number[] = [];
    runSequence(3, PROGRESS_INTERVAL_MS, (i) => seen.push(i));
    vi.advanceTimersByTime(PROGRESS_INTERVAL_MS - 1);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([1]);
    vi.advanceTimersByTime(PROGRESS_INTERVAL_MS);
    expect(seen).toEqual([1, 2]);
    vi.advanceTimersByTime(PROGRESS_INTERVAL_MS * 20);
    expect(seen).toEqual([1, 2]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("never schedules anything for a single line", () => {
    const onIndex = vi.fn();
    runSequence(1, PROGRESS_INTERVAL_MS, onIndex);
    vi.advanceTimersByTime(60_000);
    expect(onIndex).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops early when the wait ends", () => {
    const onIndex = vi.fn();
    const stop = runSequence(4, PROGRESS_INTERVAL_MS, onIndex);
    vi.advanceTimersByTime(PROGRESS_INTERVAL_MS);
    stop();
    vi.advanceTimersByTime(PROGRESS_INTERVAL_MS * 10);
    expect(onIndex).toHaveBeenCalledTimes(1);
  });
});

describe("progress lines", () => {
  it("adds the language line only when the output isn't English, with the language's own name", () => {
    expect(outputLanguageName("en", languages)).toBeNull();
    expect(outputLanguageName(null, languages)).toBeNull();
    expect(outputLanguageName("ur", languages)).toBe("اردو");

    expect(summaryLines(p, null)).toEqual([p.summary.check, p.summary.write, p.verify]);
    expect(summaryLines(p, outputLanguageName("pcm", languages))).toEqual([p.summary.check, p.summary.write, "Putting it into Naijá…", p.verify]);
    expect(explainLines(p, null)).toEqual([p.explain.check, p.explain.write, p.explain.match, p.verify]);
    expect(explainLines(p, "اردو")).toEqual([p.explain.check, p.explain.write, p.explain.match, "Putting it into اردو…", p.verify]);
    expect(changeLanguageLines(p, "Naijá")).toEqual(["Putting it into Naijá…", p.verify]);
  });

  it("has every key in en.json, non-empty, with {language} as the only placeholder", () => {
    const sequences = [p.check, p.followUps, p.letterCheck, p.photo];
    for (const lines of sequences) {
      expect(Array.isArray(lines)).toBe(true);
      expect(lines.length).toBeGreaterThan(0);
    }
    const all = [...sequences.flat(), p.summary.check, p.summary.write, p.explain.check, p.explain.write, p.explain.match, p.translate, p.verify];
    for (const line of all) {
      expect(typeof line).toBe("string");
      expect(line.trim()).not.toBe("");
      expect(line.match(/\{[a-zA-Z]+\}/g) ?? []).toEqual(line === p.translate ? ["{language}"] : []);
    }
    // The gate check says what the gate does, in plain words.
    expect(p.check.at(-1)).toBe("Checking for anything that needs help quickly…");
  });
});

describe("ProgressFeed accessibility and motion", () => {
  const tsx = readFileSync(new URL("../../src/components/ui/ProgressFeed.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../src/components/ui/ProgressFeed.module.css", import.meta.url), "utf8");

  it("has one polite live region for the first line; the changing line is hidden from screen readers", () => {
    expect(tsx.match(/aria-live=/g)).toHaveLength(1);
    expect(tsx).toMatch(/aria-live="polite"[^>]*>\s*\{announced\}/);
    expect(tsx).toContain("setAnnounced(first)");
    expect(tsx).toMatch(/className=\{styles\.lines\} aria-hidden="true"/);
  });

  it("drops the shimmer and the slide under reduced motion", () => {
    const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduced).toMatch(/\.current \{[^}]*animation: none;[^}]*background: none;/);
    expect(reduced).toMatch(/\.leaving \{[^}]*display: none;/);
  });

  it("uses design tokens only (no raw colours)", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
