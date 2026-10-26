import { afterEach, describe, expect, it, vi } from "vitest";
import type { GateResult } from "@/lib/ai/schemas";
import { failClosedResult, mostCautious, screenText } from "@/lib/client/screen";

const clear: GateResult = {
  level: "clear",
  messageKey: null,
  categories: [],
  language: "en",
  register: "standard",
  failedLayers: [],
};

function mockFetch(impl: (...args: Parameters<typeof fetch>) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("screenText", () => {
  it("returns the parsed gate result on a valid 200", async () => {
    const fetchMock = mockFetch(async () => json(clear));
    await expect(screenText("my stomach hurts", "step_text", null)).resolves.toEqual(clear);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/screen");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      text: "my stomach hurts",
      step: "step_text",
      ageBand: null,
      languageHint: null,
      context: null,
    });
  });

  it("passes the child age band through", async () => {
    const fetchMock = mockFetch(async () => json(clear));
    await screenText("fever", "step_text", "1_to_4");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).ageBand).toBe("1_to_4");
  });

  it("returns a non-clear result unchanged", async () => {
    const urgent: GateResult = { ...clear, level: "emergency", messageKey: "emergency", categories: ["chest_pain"] };
    mockFetch(async () => json(urgent));
    await expect(screenText("chest pain", "step_text", null)).resolves.toEqual(urgent);
  });

  describe("fails closed (uncertain)", () => {
    const cases: [string, () => Promise<Response>][] = [
      ["network error", async () => Promise.reject(new TypeError("Failed to fetch"))],
      ["timeout / abort", async () => Promise.reject(new DOMException("timed out", "TimeoutError"))],
      ["500", async () => json(clear, 500)],
      ["404 (route not built)", async () => new Response("Not found", { status: 404 })],
      ["429", async () => json({ error: "rate_limited" }, 429)],
      ["non-JSON body", async () => new Response("<html>", { status: 200 })],
      ["empty body", async () => new Response("", { status: 200 })],
      ["wrong shape", async () => json({ ok: true })],
      ["unknown level", async () => json({ ...clear, level: "fine" })],
      ["null body", async () => json(null)],
    ];

    it.each(cases)("%s", async (_name, impl) => {
      mockFetch(impl);
      const result = await screenText("some text", "step_text", null);
      expect(result.level).toBe("uncertain");
      expect(result).toEqual(failClosedResult());
    });

    it("an invalid request is never sent and is uncertain", async () => {
      const fetchMock = mockFetch(async () => json(clear));
      const result = await screenText("", "step_text", null);
      expect(result.level).toBe("uncertain");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("never resolves to clear when the body is clear but status is an error", async () => {
      mockFetch(async () => json(clear, 503));
      expect((await screenText("x", "step_text", null)).level).not.toBe("clear");
    });
  });
});

describe("mostCautious", () => {
  const r = (level: GateResult["level"]): GateResult => ({ ...clear, level });

  it("returns null only when everything is clear", () => {
    expect(mostCautious([r("clear"), r("clear")])).toBeNull();
  });

  it("picks the most cautious level", () => {
    expect(mostCautious([r("uncertain"), r("emergency"), r("clear")])?.level).toBe("emergency");
    expect(mostCautious([r("urgent"), r("crisis")])?.level).toBe("crisis");
    expect(mostCautious([r("clear"), r("uncertain")])?.level).toBe("uncertain");
  });

  it("keeps the categories of every non-clear result", () => {
    const chest = { ...r("emergency"), categories: ["chest_pain" as const] };
    const selfHarm = { ...r("crisis"), categories: ["self_harm_or_suicide" as const] };
    const worst = mostCautious([chest, { ...clear, categories: [] }, selfHarm]);
    expect(worst?.level).toBe("emergency");
    expect(worst?.categories.sort()).toEqual(["chest_pain", "self_harm_or_suicide"]);
  });
});
