import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Journey 2 "Change language" (/api/translate): re-derives only an English master this server signed.
const letter = JSON.parse(fs.readFileSync(new URL("../fixtures/gp-letter-explain.json", import.meta.url), "utf8"));

const req = (path: string, body: unknown) =>
  new Request(`http://localhost:3000${path}`, { method: "POST", headers: { host: "localhost:3000", "content-type": "application/json" }, body: JSON.stringify(body) });

describe("/api/translate", () => {
  const derive = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_PATH", ":memory:");
    derive.mockReset();
    vi.doMock("@/lib/ai/pipeline/journeys", async (orig) => ({
      ...(await orig<typeof import("@/lib/ai/pipeline/journeys")>()),
      runExplain: async () => structuredClone(letter.explainDefault),
    }));
    // A language change must never re-screen or re-draft: both throw if called.
    vi.doMock("@/lib/safety/gate", async (orig) => ({
      ...(await orig<typeof import("@/lib/safety/gate")>()),
      screen: () => {
        throw new Error("screen called");
      },
    }));
    vi.doMock("@/lib/ai/pipeline/understand", async (orig) => ({
      ...(await orig<typeof import("@/lib/ai/pipeline/understand")>()),
      generatePostMaster: () => {
        throw new Error("draft called");
      },
    }));
    vi.doMock("@/lib/ai/pipeline/derive", async (orig) => ({
      ...(await orig<typeof import("@/lib/ai/pipeline/derive")>()),
      deriveVersion: derive,
    }));
    delete (globalThis as { __carenavMasterKey?: Buffer }).__carenavMasterKey;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    for (const m of ["@/lib/ai/pipeline/journeys", "@/lib/safety/gate", "@/lib/ai/pipeline/understand", "@/lib/ai/pipeline/derive"]) vi.doUnmock(m);
    vi.resetModules();
  });

  async function signed() {
    const explain = (await import("@/app/api/explain/route")).POST;
    const out = await (await explain(req("/api/explain", { confirmedText: letter.letter, source: "typed", followUps: [] }))).json();
    return { out, translate: (await import("@/app/api/translate/route")).POST };
  }

  it("/api/explain returns a token, and a valid one re-derives the master only", async () => {
    const { out, translate } = await signed();
    expect(out.masterToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const { ungrounded, disclaimer, meta, ...grounded } = out.english;
    void [ungrounded, disclaimer, meta];
    derive.mockResolvedValue({ ok: true, version: grounded, confidence: "high", confidenceNotice: true, promptVersion: "derive@v2" });

    const res = await translate(req("/api/translate", { english: out.english, masterToken: out.masterToken, outputLanguage: "so" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(derive).toHaveBeenCalledTimes(1);
    expect(derive.mock.calls[0][2]).toMatchObject({ code: "so", mode: "translation" });
    expect(body.english).toEqual(out.english);
    expect(body.user.meta).toMatchObject({ outputLanguage: "so", detectedLanguage: out.english.meta.detectedLanguage, confidenceNotice: true });
    expect(body.user.ungrounded).toEqual(out.english.ungrounded);
  });

  it("refuses an English master the client changed, a made-up token, and a token from before a restart", async () => {
    const { out, translate } = await signed();
    const changed = structuredClone(out.english);
    changed.medicines[0].dose = "50mg";
    const call = (english: unknown, masterToken: string) => translate(req("/api/translate", { english, masterToken, outputLanguage: "so" }));

    expect((await call(changed, out.masterToken)).status).toBe(403);
    expect((await call(out.english, "A".repeat(43))).status).toBe(403);
    delete (globalThis as { __carenavMasterKey?: Buffer }).__carenavMasterKey; // a new process key
    expect((await call(out.english, out.masterToken)).status).toBe(403);
    expect(derive).not.toHaveBeenCalled();
  });

  it("rejects a malformed request", async () => {
    const { translate } = await signed();
    expect((await translate(req("/api/translate", { english: {}, masterToken: "x", outputLanguage: "so" }))).status).toBe(400);
  });
});
