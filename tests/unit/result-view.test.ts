import { describe, expect, it } from "vitest";
import { preAppointmentResultSchema, type ResultMeta } from "@/lib/ai/schemas";
import {
  detectedLanguageName,
  highlightSegments,
  medicineLine,
  medicineTerms,
  safeHref,
  userTabLabel,
  versionDir,
  type LanguageNames,
} from "@/lib/result/view";
import fixture from "../fixtures/marcia-summary.json";

const languages: LanguageNames = {
  en: { englishName: "English", nativeName: "English", dir: "ltr" },
  jam: { englishName: "Jamaican Patois", nativeName: "Patwa", dir: "ltr" },
  pl: { englishName: "Polish", nativeName: "Polski", dir: "ltr" },
  ur: { englishName: "Urdu", nativeName: "اردو", dir: "rtl" },
  "zh-Hans": { englishName: "Mandarin (Simplified)", nativeName: "简体中文", dir: "ltr" },
};

const meta = (patch: Partial<ResultMeta>): ResultMeta => ({
  detectedLanguage: "en",
  register: "standard",
  outputLanguage: "en",
  outputMode: "simple_english",
  promptVersion: "v1",
  confidenceNotice: false,
  urgentAcknowledged: null,
  ...patch,
});

const joined = (segs: { text: string }[]) => segs.map((s) => s.text).join("");
const marked = (segs: { text: string; mark: boolean }[]) => segs.filter((s) => s.mark).map((s) => s.text);

describe("highlightSegments", () => {
  it("marks every case-insensitive occurrence and keeps the text byte-identical", () => {
    const text = "Paracetamol in the morning, paracetamol at night.";
    const segs = highlightSegments(text, ["paracetamol"]);
    expect(joined(segs)).toBe(text);
    expect(marked(segs)).toEqual(["Paracetamol", "paracetamol"]);
  });

  it("prefers the longer term where terms overlap", () => {
    const segs = highlightSegments("Take ibuprofen gel twice", ["ibuprofen", "ibuprofen gel"]);
    expect(marked(segs)).toEqual(["ibuprofen gel"]);
  });

  it("marks name and dose separately when they are not adjacent", () => {
    const segs = highlightSegments("I take metformin, 500 mg, twice a day", ["metformin", "500 mg"]);
    expect(marked(segs)).toEqual(["metformin", "500 mg"]);
  });

  it("ignores empty, null and one-character terms, and handles empty text", () => {
    expect(highlightSegments("a b c", [null, undefined, "", " ", "a"])).toEqual([{ text: "a b c", mark: false }]);
    expect(highlightSegments("", ["x"])).toEqual([]);
  });

  it("treats terms as plain text, not patterns", () => {
    expect(marked(highlightSegments("dose (2.5 ml) daily", ["(2.5 ml)"]))).toEqual(["(2.5 ml)"]);
    expect(marked(highlightSegments("dose 2x5 ml", ["2.5 ml"]))).toEqual([]);
  });
});

describe("medicine helpers", () => {
  const version = preAppointmentResultSchema.parse(fixture.user);

  it("collects names and doses for highlighting", () => {
    expect(medicineTerms(version)).toEqual(["paracetamol", "two tablets, sometimes", "cream from the pharmacy"]);
  });

  it("formats a medicine line with and without a dose", () => {
    expect(medicineLine({ name: "paracetamol", dose: "two tablets" })).toBe("paracetamol, two tablets");
    expect(medicineLine({ name: "cream", dose: null })).toBe("cream");
  });
});

describe("language labels", () => {
  it("shows the detected language by its English name (AC-04.4), and nothing when unknown", () => {
    expect(detectedLanguageName("jam", languages)).toBe("Jamaican Patois");
    expect(detectedLanguageName("pl-PL", languages)).toBe("Polish");
    expect(detectedLanguageName("und", languages)).toBeNull();
    expect(detectedLanguageName("xx", languages)).toBeNull();
  });

  it("labels the user tab Simple English for dialects, else the language's own name", () => {
    expect(userTabLabel(meta({ outputLanguage: "jam", outputMode: "simple_english" }), languages, "Simple English")).toBe("Simple English");
    expect(userTabLabel(meta({ outputLanguage: "pl", outputMode: "translation" }), languages, "Simple English")).toBe("Polski");
    expect(userTabLabel(meta({ outputLanguage: "xx", outputMode: "translation" }), languages, "Simple English")).toBe("xx");
  });

  it("sets right-to-left only for translated right-to-left languages", () => {
    expect(versionDir(meta({ outputLanguage: "ur", outputMode: "translation" }), languages)).toBe("rtl");
    expect(versionDir(meta({ outputLanguage: "zh-Hans", outputMode: "translation" }), languages)).toBe("ltr");
    expect(versionDir(meta({ outputLanguage: "ur", outputMode: "simple_english" }), languages)).toBe("ltr");
  });
});

describe("safeHref", () => {
  it("allows only tel: digits and https links", () => {
    expect(safeHref("tel:111")).toBe("tel:111");
    expect(safeHref("https://111.nhs.uk")).toBe("https://111.nhs.uk");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("http://example.com")).toBeNull();
    expect(safeHref("tel:111;x")).toBeNull();
  });
});
