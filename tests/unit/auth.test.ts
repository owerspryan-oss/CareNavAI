import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/api/route";
import { assertEmailRate, login, register, requestMagicLink, verifyMagicLink } from "@/lib/auth/account";
import { consumeInvite, createInvite, newInviteCode, normaliseInviteCode } from "@/lib/auth/invites";
import { deliverToDevInbox, devInbox, MAGIC_LINK_TTL_MS, magicLinkUrl } from "@/lib/auth/magic";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { clearSessionCookie, createSession, destroySession, readSession, SESSION_TTL_MS, sessionCookie } from "@/lib/auth/sessions";
import { sha256 } from "@/lib/auth/tokens";
import { createUser, deleteAccount, findUserByEmail } from "@/lib/auth/users";
import { openDb, type DB } from "@/lib/db";
import { isHttps, isLocalHost } from "@/lib/security/local";

// T-23 / FR-12, FR-13: password and magic-link accounts, sessions, invites, rate limits.

const NOW = Date.UTC(2026, 9, 22, 12);
let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
});
afterEach(() => db.close());

const code = async (p: Promise<unknown> | (() => unknown)) => {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    return e instanceof HttpError ? `${e.status} ${e.code}` : String(e);
  }
  return "ok";
};
const opts = (over: Partial<{ now: number; invitesRequired: boolean }> = {}) => ({ db, now: NOW, invitesRequired: false, ...over });

describe("passwords (AC-12.1)", () => {
  it("hashes with argon2id and never keeps the plain text", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(h).not.toContain("correct horse");
    expect(await verifyPassword(h, "correct horse battery")).toBe(true);
    expect(await verifyPassword(h, "wrong horse battery")).toBe(false);
    expect(await verifyPassword(null, "anything at all")).toBe(false);
  });
});

describe("register and login (FR-12)", () => {
  it("needs at least 10 characters, then stores only the hash", async () => {
    expect(await code(register({ email: "a@example.com", password: "short", inviteCode: null }, opts()))).toBe("400 password_too_short");
    const user = await register({ email: " Ana@Example.com ", password: "a long password", inviteCode: null }, opts());
    expect(user.email).toBe("ana@example.com");
    const row = db.prepare("SELECT * FROM users").get() as Record<string, unknown>;
    expect(JSON.stringify(row)).not.toContain("a long password");
    expect(String(row.password_hash)).toMatch(/^\$argon2id\$/);
  });

  it("refuses a second account for the same email with a generic error", async () => {
    await register({ email: "ana@example.com", password: "a long password", inviteCode: null }, opts());
    expect(await code(register({ email: "ANA@example.com", password: "another password", inviteCode: null }, opts()))).toBe("409 register_failed");
  });

  it("gives the same answer for an unknown email, a wrong password and a link-only account", async () => {
    await register({ email: "ana@example.com", password: "a long password", inviteCode: null }, opts());
    createUser(db, "link@example.com", null, NOW);
    expect(await code(login({ email: "nobody@example.com", password: "a long password" }, { db }))).toBe("401 login_failed");
    expect(await code(login({ email: "ana@example.com", password: "not the password" }, { db }))).toBe("401 login_failed");
    expect(await code(login({ email: "link@example.com", password: "a long password" }, { db }))).toBe("401 login_failed");
    expect((await login({ email: "ANA@example.com", password: "a long password" }, { db })).email).toBe("ana@example.com");
  });
});

describe("invites (AC-12.4)", () => {
  it("are needed only when the pilot setting is on, and stored as a hash", async () => {
    const invite = newInviteCode();
    expect(invite).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
    createInvite(db, invite, { maxUses: 1 });
    expect(JSON.stringify(db.prepare("SELECT * FROM invites").all())).not.toContain(normaliseInviteCode(invite));

    const on = opts({ invitesRequired: true });
    expect(await code(register({ email: "a@example.com", password: "a long password", inviteCode: null }, on))).toBe("400 invite_invalid");
    expect(await code(register({ email: "a@example.com", password: "a long password", inviteCode: "WRONG-CODE" }, on))).toBe("400 invite_invalid");
    // Typed back in lower case without dashes still works.
    expect(await code(register({ email: "a@example.com", password: "a long password", inviteCode: invite.toLowerCase().replace(/-/g, "") }, on))).toBe("ok");
    // Used up.
    expect(await code(register({ email: "b@example.com", password: "a long password", inviteCode: invite }, on))).toBe("400 invite_invalid");
    expect(findUserByEmail(db, "b@example.com")).toBeUndefined();
  });

  it("respect max uses and expiry", () => {
    createInvite(db, "AAAA-BBBB-CCCC", { maxUses: 2, expiresAt: NOW + 1000 });
    expect(consumeInvite(db, "AAAA-BBBB-CCCC", NOW)).toBe(true);
    expect(consumeInvite(db, "AAAA-BBBB-CCCC", NOW + 1000)).toBe(false); // expired
    expect(consumeInvite(db, "AAAA-BBBB-CCCC", NOW)).toBe(true);
    expect(consumeInvite(db, "AAAA-BBBB-CCCC", NOW)).toBe(false); // used up
    expect(consumeInvite(db, "", NOW)).toBe(false);
  });

  it("can be created with npm run invite:create, printed once and stored hash-only", () => {
    const dir = mkdtempSync(join(tmpdir(), "carenav-invite-"));
    try {
      const file = join(dir, "db.sqlite");
      const out = execFileSync(process.execPath, ["scripts/invite.mjs", "--uses", "3", "--days", "0"], { env: { ...process.env, DATABASE_PATH: file }, encoding: "utf8" });
      const printed = out.match(/Invite code: ([A-Z0-9-]{14})/)![1];
      const raw = new Database(file);
      const rows = raw.prepare("SELECT * FROM invites").all() as { code_hash: string; max_uses: number; expires_at: number | null }[];
      raw.close();
      expect(rows).toEqual([{ code_hash: sha256(normaliseInviteCode(printed)), max_uses: 3, used: 0, expires_at: null }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("magic links (AC-13.1)", () => {
  it("work once, store only a hash, and create the account if needed (PRD §3.5)", async () => {
    const token = requestMagicLink({ email: "New@Example.com" }, { db, now: NOW });
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(db.prepare("SELECT * FROM magic_links").all())).not.toContain(token);
    const user = verifyMagicLink({ token, inviteCode: null }, opts({ now: NOW + 1000 }));
    expect(user.email).toBe("new@example.com");
    expect(user.password_hash).toBeNull();
    expect(await code(() => verifyMagicLink({ token, inviteCode: null }, opts({ now: NOW + 2000 })))).toBe("400 link_invalid");
  });

  it("expire after 15 minutes", async () => {
    const token = requestMagicLink({ email: "a@example.com" }, { db, now: NOW });
    expect(await code(() => verifyMagicLink({ token, inviteCode: null }, opts({ now: NOW + MAGIC_LINK_TTL_MS })))).toBe("400 link_invalid");
  });

  it("sign in an existing account without an invite", () => {
    createUser(db, "ana@example.com", null, NOW);
    const token = requestMagicLink({ email: "ana@example.com" }, { db, now: NOW });
    expect(verifyMagicLink({ token, inviteCode: null }, opts({ invitesRequired: true })).email).toBe("ana@example.com");
  });

  it("ask a new account for an invite without using the link up; a wrong code rolls back", async () => {
    createInvite(db, "AAAA-BBBB-CCCC");
    const token = requestMagicLink({ email: "new@example.com" }, { db, now: NOW });
    const on = opts({ invitesRequired: true });
    expect(await code(() => verifyMagicLink({ token, inviteCode: null }, on))).toBe("400 invite_required");
    expect(await code(() => verifyMagicLink({ token, inviteCode: "XXXX-XXXX-XXXX" }, on))).toBe("400 invite_invalid");
    expect(findUserByEmail(db, "new@example.com")).toBeUndefined();
    expect(verifyMagicLink({ token, inviteCode: "aaaa bbbb cccc" }, on).email).toBe("new@example.com");
  });

  it("dev inbox keeps recent unexpired links in memory only", () => {
    const link = magicLinkUrl("http://localhost:3000/", "tok");
    expect(link).toBe("http://localhost:3000/account/verify?token=tok");
    deliverToDevInbox({ to: "a@example.com", link, sentAt: NOW, expiresAt: NOW + MAGIC_LINK_TTL_MS });
    expect(devInbox(NOW).map((i) => i.link)).toContain(link);
    expect(devInbox(NOW + MAGIC_LINK_TTL_MS).map((i) => i.link)).not.toContain(link);
  });
});

describe("sessions (AC-12.3)", () => {
  it("store only the id's hash, expire after 24 h, and slide forward at most hourly", () => {
    const user = createUser(db, "ana@example.com", null, NOW);
    const token = createSession(db, user.id, NOW);
    const rows = db.prepare("SELECT * FROM sessions").all() as { id_hash: string; expires_at: number }[];
    expect(rows).toEqual([{ id_hash: sha256(token), user_id: user.id, expires_at: NOW + SESSION_TTL_MS }]);

    expect(readSession(db, token, NOW + 30 * 60_000, { extend: true })).toMatchObject({ extended: false });
    expect(readSession(db, token, NOW + 2 * 3_600_000, { extend: true })).toMatchObject({ extended: true });
    expect(readSession(db, token, NOW + 25 * 3_600_000)?.user.id).toBe(user.id); // slid forward
    expect(readSession(db, token, NOW + 27 * 3_600_000)).toBeNull();
    expect(readSession(db, "not-a-session", NOW)).toBeNull();

    const other = createSession(db, user.id, NOW);
    destroySession(db, other);
    expect(readSession(db, other, NOW)).toBeNull();
  });

  it("cookies are HttpOnly, SameSite=Lax and Secure except on localhost", () => {
    expect(sessionCookie("t", true)).toBe("cn_session=t; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400; Secure");
    expect(sessionCookie("t", false)).not.toContain("Secure");
    expect(clearSessionCookie(true)).toContain("Max-Age=0");
  });

  it("local and HTTPS detection", () => {
    expect(isLocalHost("localhost:3000")).toBe(true);
    expect(isLocalHost("127.0.0.1")).toBe(true);
    expect(isLocalHost("[::1]:3000")).toBe(true);
    expect(isLocalHost("carenav.example")).toBe(false);
    expect(isLocalHost("localhost.evil.example")).toBe(false);
    expect(isHttps(new Request("https://carenav.example/api/auth/login"))).toBe(true);
    expect(isHttps(new Request("http://carenav.example/x", { headers: { "x-forwarded-proto": "https" } }))).toBe(true);
    expect(isHttps(new Request("http://carenav.example/x"))).toBe(false);
  });
});

describe("rate limits (AC-12.2)", () => {
  it("allow 5 tries per email per 15 minutes, whatever the case", async () => {
    for (let i = 0; i < 5; i++) assertEmailRate(db, i % 2 ? "Ana@example.com" : "ana@example.com", NOW);
    expect(await code(() => assertEmailRate(db, "ANA@example.com", NOW))).toBe("429 rate_limited");
    expect(await code(() => assertEmailRate(db, "other@example.com", NOW))).toBe("ok");
    expect(await code(() => assertEmailRate(db, "ana@example.com", NOW + 15 * 60_000))).toBe("ok");
    // The key is a hash: no email in the table.
    expect(JSON.stringify(db.prepare("SELECT key FROM rate_limits").all())).not.toContain("ana@");
  });
});

describe("account delete (AC-14.4)", () => {
  it("removes the user, sessions, magic links and summaries in one action", () => {
    const user = createUser(db, "ana@example.com", null, NOW);
    const other = createUser(db, "bo@example.com", null, NOW);
    createSession(db, user.id, NOW);
    createSession(db, other.id, NOW);
    requestMagicLink({ email: "ana@example.com" }, { db, now: NOW });
    requestMagicLink({ email: "bo@example.com" }, { db, now: NOW });
    const insert = db.prepare(
      "INSERT INTO summaries (id, user_id, flow, for_whom_label, is_child, language_detected, language_output, payload_enc, iv, tag, key_version, created_at) VALUES (?, ?, 'prepare', 'self', 0, 'en', 'en', x'00', x'00', x'00', 1, ?)",
    );
    insert.run("s1", user.id, NOW);
    insert.run("s2", other.id, NOW);
    deleteAccount(db, user.id);
    const count = (t: string) => (db.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;
    expect([count("users"), count("sessions"), count("magic_links"), count("summaries")]).toEqual([1, 1, 1, 1]);
    expect(findUserByEmail(db, "bo@example.com")).toBeDefined();
  });
});

// ---- Routes -----------------------------------------------------------------

describe("/api/auth routes", () => {
  let logged: string[];
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("DATABASE_PATH", ":memory:");
    vi.stubEnv("PILOT_INVITE_REQUIRED", "false");
    logged = [];
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  async function routes() {
    const { log } = await import("@/lib/log/logger");
    for (const level of ["info", "warn", "error"] as const) vi.spyOn(log, level).mockImplementation((e) => void logged.push(JSON.stringify(e)));
    return {
      register: (await import("@/app/api/auth/register/route")).POST,
      login: (await import("@/app/api/auth/login/route")).POST,
      magicRequest: (await import("@/app/api/auth/magic/request/route")).POST,
      magicVerify: (await import("@/app/api/auth/magic/verify/route")).POST,
      logout: (await import("@/app/api/auth/logout/route")).POST,
      me: (await import("@/app/api/auth/me/route")).GET,
      inbox: (await import("@/lib/auth/magic")).devInbox,
    };
  }
  const req = (url: string, body?: unknown, cookie?: string) =>
    new Request(url, {
      method: body === undefined ? "GET" : "POST",
      headers: { host: new URL(url).host, "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const sessionFrom = (res: Response) => res.headers.getSetCookie().find((c) => c.startsWith("cn_session="))!;

  it("register -> me -> logout -> login, on localhost, with no email or password in the logs", async () => {
    const r = await routes();
    const reg = await r.register(req("http://localhost:3000/api/auth/register", { email: "ana@example.com", password: "a long password", inviteCode: null }));
    expect(reg.status).toBe(200);
    const cookie = sessionFrom(reg);
    expect(cookie).toMatch(/HttpOnly; SameSite=Lax/);
    expect(cookie).not.toContain("Secure");
    const session = cookie.split(";")[0];

    expect(await (await r.me(req("http://localhost:3000/api/auth/me", undefined, session))).json()).toMatchObject({ user: { email: "ana@example.com" } });
    const out = await r.logout(req("http://localhost:3000/api/auth/logout", {}, session));
    expect(sessionFrom(out)).toContain("Max-Age=0");
    expect(await (await r.me(req("http://localhost:3000/api/auth/me", undefined, session))).json()).toEqual({ user: null });

    expect((await r.login(req("http://localhost:3000/api/auth/login", { email: "ana@example.com", password: "nope nope nope" }))).status).toBe(401);
    const ok = await r.login(req("http://localhost:3000/api/auth/login", { email: "ana@example.com", password: "a long password" }));
    expect(ok.status).toBe(200);
    expect(sessionFrom(ok)).toBeTruthy();

    const all = logged.join("\n");
    expect(all).not.toContain("ana@");
    expect(all).not.toContain("a long password");
  });

  it("refuses accounts over plain HTTP away from localhost (AC-12.3), and sets Secure over HTTPS", async () => {
    const r = await routes();
    const body = { email: "ana@example.com", password: "a long password", inviteCode: null };
    const plain = await r.register(req("http://carenav.example/api/auth/register", body));
    expect(plain.status).toBe(403);
    expect(await plain.json()).toEqual({ error: "https_required" });
    const secure = await r.register(req("https://carenav.example/api/auth/register", body));
    expect(secure.status).toBe(200);
    expect(sessionFrom(secure)).toContain("Secure");
  });

  it("magic link: same answer for any email, link only in the dev inbox, single use", async () => {
    const r = await routes();
    const a = await r.magicRequest(req("http://localhost:3000/api/auth/magic/request", { email: "ana@example.com" }));
    expect(await a.json()).toEqual({ ok: true });
    const link = r.inbox()[0].link;
    const token = new URL(link).searchParams.get("token")!;
    expect(logged.join("\n")).not.toContain(token);

    const first = await r.magicVerify(req("http://localhost:3000/api/auth/magic/verify", { token, inviteCode: null }));
    expect(first.status).toBe(200);
    expect(sessionFrom(first)).toBeTruthy();
    const again = await r.magicVerify(req("http://localhost:3000/api/auth/magic/verify", { token, inviteCode: null }));
    expect(await again.json()).toEqual({ error: "link_invalid" });
  });

  it("rate limits login per email (AC-12.2)", async () => {
    const r = await routes();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await r.login(req("http://localhost:3000/api/auth/login", { email: "ana@example.com", password: "wrong password" }))).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it("requires an invite to register when PILOT_INVITE_REQUIRED=true", async () => {
    vi.stubEnv("PILOT_INVITE_REQUIRED", "true");
    const r = await routes();
    const res = await r.register(req("http://localhost:3000/api/auth/register", { email: "ana@example.com", password: "a long password", inviteCode: null }));
    expect(await res.json()).toEqual({ error: "invite_invalid" });
  });
});
