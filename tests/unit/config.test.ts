import { describe, expect, it } from "vitest";
import { MODEL_ROLES, languagesConfig, modelFor, pricingConfig } from "@/lib/config";
import { parseEnv } from "@/lib/config/env";

describe("env", () => {
  it("defaults URGENT_MODE to continue_after_ack (v0.3 A2)", () => {
    expect(parseEnv({}).URGENT_MODE).toBe("continue_after_ack");
  });

  it("defaults the DRAFT label to on (FR-29)", () => {
    expect(parseEnv({}).SHOW_DRAFT_LABEL).toBe(true);
  });

  it("treats blank values as unset", () => {
    expect(parseEnv({ URGENT_MODE: "", MONTHLY_CAP_GBP: "" })).toMatchObject({
      URGENT_MODE: "continue_after_ack",
      MONTHLY_CAP_GBP: 50,
    });
  });

  it("rejects an unknown urgent mode", () => {
    expect(() => parseEnv({ URGENT_MODE: "off" })).toThrow();
  });
});

describe("config files", () => {
  it("has a model for every role, and a price for every text model", () => {
    for (const role of MODEL_ROLES) {
      const { model } = modelFor(role);
      expect(pricingConfig.models[model], `${role} -> ${model}`).toBeDefined();
    }
  });

  it("lists exactly the v0.3 A4 Tier A targets", () => {
    const targets = languagesConfig.languages.filter((l) => l.tierATarget).map((l) => l.code);
    expect(targets.sort()).toEqual(["gyn", "hi", "ht", "jam", "kri", "pcm", "trf", "tw"]);
  });

  it("applies the v0.3 A5 output modes", () => {
    const mode = (code: string) => languagesConfig.languages.find((l) => l.code === code)?.outputMode;
    expect(mode("pcm")).toBe("dialect_output");
    for (const c of ["jam", "kri", "gyn", "trf"]) expect(mode(c)).toBe("simple_english");
    for (const c of ["tw", "ht", "hi"]) expect(mode(c)).toBe("translation");
  });

  it("never stores a hand-edited tier (ADR-013)", () => {
    for (const l of languagesConfig.languages) expect(l).not.toHaveProperty("tier");
  });
});
