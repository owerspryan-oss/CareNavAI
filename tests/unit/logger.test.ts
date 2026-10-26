import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, sanitize } from "@/lib/log/logger";

function capture() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { lines, destination };
}

describe("allow-list logger", () => {
  it("drops fields that are not on the allow-list", () => {
    const out = sanitize({
      route: "/api/screen",
      status: 200,
      freeText: "I have chest pain",
      body: { text: "secret" },
      transcript: "my NHS number is 943 476 5919",
    });
    expect(out).toEqual({ route: "/api/screen", status: 200 });
  });

  it("skips undefined values instead of marking them dropped", () => {
    expect(sanitize({ requestId: undefined, route: "/x" })).toEqual({ route: "/x" });
  });

  it("refuses free text smuggled into an allowed field", () => {
    const out = sanitize({ errorType: "I have crushing chest pain since this morning" });
    expect(out.errorType).toBe("[dropped]");
  });

  it("refuses objects smuggled into an allowed field", () => {
    expect(sanitize({ step: { text: "x" } }).step).toBe("[dropped]");
  });

  it("writes no user content to the output stream", () => {
    const { lines, destination } = capture();
    const logger = createLogger({ level: "info", destination });
    logger.info({
      route: "/api/summary",
      safetyLevel: "clear",
      languageCode: "pcm",
      // @ts-expect-error -- disallowed field is a type error as well as being dropped at runtime
      userText: "Doctor say make I take paracetamol",
    });
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record).toMatchObject({ route: "/api/summary", safetyLevel: "clear", languageCode: "pcm" });
    expect(lines[0]).not.toContain("paracetamol");
    expect(Object.keys(record).sort()).toEqual(["languageCode", "level", "route", "safetyLevel", "time"]);
  });
});
