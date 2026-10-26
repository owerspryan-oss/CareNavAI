import { afterEach, describe, expect, it, vi } from "vitest";
import { explainRequestSchema, followUpsRequestSchema } from "@/lib/ai/schemas";
import { extractLetter, extractProblemFor, fetchExplain, fetchLetterFollowUps } from "@/lib/client/understand";
import fixture from "../fixtures/gp-letter-explain.json";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const gate = { level: "urgent", messageKey: "urgent", categories: ["urgent_wording_in_letter"], language: "en", register: "standard", failedLayers: [] };

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

const image = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });

describe("extractLetter (FR-08)", () => {
  it("posts the image as multipart field `image` and returns the text and candidates", async () => {
    const f = mockFetch(async () => json(fixture.extract));
    const out = await extractLetter(image);
    expect(out).toEqual(fixture.extract);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/extract");
    expect((init.body as FormData).get("image")).toBeInstanceOf(Blob);
  });

  it("asks for a retake on poor legibility or empty text, never continues (AC-08.4)", async () => {
    mockFetch(async () => json({ kind: "retake" }));
    expect(await extractLetter(image)).toEqual({ kind: "problem", problem: "retake" });
    mockFetch(async () => json({ kind: "extracted", text: "  ", medicineCandidates: [] }));
    expect(await extractLetter(image)).toEqual({ kind: "problem", problem: "retake" });
  });

  it("maps statuses, network failures and malformed bodies to static problems", async () => {
    expect([400, 413, 429, 503, 502, 500].map(extractProblemFor)).toEqual(["invalid", "too_large", "rate_limited", "busy", "failed", "failed"]);
    mockFetch(async () => json({ error: "image_too_large" }, 413));
    expect(await extractLetter(image)).toEqual({ kind: "problem", problem: "too_large" });
    mockFetch(async () => {
      throw new TypeError("offline");
    });
    expect(await extractLetter(image)).toEqual({ kind: "problem", problem: "failed" });
    mockFetch(async () => json({ kind: "extracted", text: 42 }));
    expect(await extractLetter(image)).toEqual({ kind: "problem", problem: "failed" });
  });
});

describe("fetchLetterFollowUps (FR-22)", () => {
  it("sends a valid Journey 2 request and returns the questions", async () => {
    const f = mockFetch(async () => json(fixture.followups));
    const out = await fetchLetterFollowUps(fixture.letter, true);
    expect(out).toEqual(fixture.followups);
    const body = JSON.parse(f.mock.calls[0][1].body as string);
    expect(body).toEqual({ journey: "understand", confirmedText: fixture.letter, acknowledgedUrgent: true });
    expect(followUpsRequestSchema.safeParse(body).success).toBe(true);
  });

  it("rejects intents outside the post-appointment list", async () => {
    mockFetch(async () => json({ kind: "followups", questions: [{ intent: "clarify_duration", question: "How long?" }] }));
    expect(await fetchLetterFollowUps("x", false)).toEqual({ kind: "error", error: "failed" });
  });

  it("routes up on an urgent response, even a malformed one", async () => {
    mockFetch(async () => json({ kind: "urgent", gate }));
    expect(await fetchLetterFollowUps("x", false)).toMatchObject({ kind: "urgent", gate: { level: "urgent" } });
    mockFetch(async () => json({ kind: "urgent", gate: { level: "clear" } }));
    expect(await fetchLetterFollowUps("x", false)).toMatchObject({ kind: "urgent", gate: { level: "uncertain" } });
  });
});

describe("fetchExplain (FR-02)", () => {
  const req = { confirmedText: fixture.letter, source: "photo" as const, followUps: [], acknowledgedUrgent: false, outputLanguage: "pcm" };

  it("sends a request the server schema accepts and returns a validated result", async () => {
    const f = mockFetch(async () => json(fixture.explainPcm));
    const out = await fetchExplain(req);
    expect(out.kind).toBe("result");
    expect(explainRequestSchema.safeParse(JSON.parse(f.mock.calls[0][1].body as string)).success).toBe(true);
  });

  it("treats a result that fails the schema as an error, never renders it", async () => {
    const broken = structuredClone(fixture.explainDefault) as Record<string, unknown>;
    delete (broken.english as Record<string, unknown>).ungrounded;
    mockFetch(async () => json(broken));
    expect(await fetchExplain(req)).toEqual({ kind: "error", error: "failed" });
  });

  it("maps 413 and 503 to static errors", async () => {
    mockFetch(async () => json({ error: "text_too_long" }, 413));
    expect(await fetchExplain(req)).toEqual({ kind: "error", error: "too_long" });
    mockFetch(async () => json({ error: "service_busy" }, 503));
    expect(await fetchExplain(req)).toEqual({ kind: "error", error: "busy" });
  });

  it("routes up on an urgent response", async () => {
    mockFetch(async () => json({ kind: "urgent", gate }));
    expect(await fetchExplain(req)).toMatchObject({ kind: "urgent", gate: { level: "urgent" } });
  });
});
