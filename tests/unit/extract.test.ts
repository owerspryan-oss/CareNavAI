import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { extractFromImage } from "@/lib/ai/pipeline/extract";
import { openDb, type DB } from "@/lib/db";

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
});
afterEach(() => db.close());

describe("extractFromImage (T-19)", () => {
  it("sends the image as data with store:false and redacts identifiers the model missed", async () => {
    const parse = vi.fn().mockResolvedValue({
      output_parsed: { text: "NHS no 943 476 5919. Amlodipine 5mg once a day.", medicineCandidates: [{ name: "Amlodipine", dose: "5mg" }], legibility: "good" },
      usage: { input_tokens: 1000, output_tokens: 50 },
    });
    const r = await extractFromImage({ bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" }, {}, { openai: { responses: { parse }, moderations: { create: vi.fn() } } as never, db, capGbp: 50 });
    const body = parse.mock.calls[0][0];
    expect(body.store).toBe(false);
    expect(body.input[0].content[0]).toMatchObject({ type: "input_image", image_url: "data:image/jpeg;base64,AQID" });
    expect(r.text).toBe("NHS no [NHS-NUMBER]. Amlodipine 5mg once a day.");
    expect(r.promptVersion).toBe("extract@v1");
  });
});
