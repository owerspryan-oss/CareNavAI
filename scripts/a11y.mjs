// T-18 accessibility check: `npm run test:a11y` (with `npm run dev` already running).
//
// Drives both journeys in a phone-sized browser and runs axe (WCAG 2.1 A/AA) on every screen, then
// checks the same screens at 200% text size for sideways scrolling. The API is faked from the test
// fixtures so every screen is reachable without OPENAI_API_KEY. That is a UI test only: the real
// gate is covered by `npm test` and `npm run test:urgency`. Exits 1 on any violation.
//
// A11Y_LANGS=en,ur (default "en") runs the whole set once per interface language, finding buttons by
// their text in content/ui/<lang>.json, so right-to-left and long-text languages are checked too.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = process.env.A11Y_BASE_URL ?? "http://localhost:3000";
const fixture = (name) => JSON.parse(readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url), "utf8"));
const LETTER = fixture("gp-letter-explain.json");
const SUMMARY = fixture("marcia-summary.json");
const LETTER_PNG = fileURLToPath(new URL("../demo/letter/gp-letter.png", import.meta.url));

/** A gate result with no user text, as /api/screen returns it. */
const gate = (level, categories = []) => ({
  level,
  messageKey: level === "clear" ? null : level === "uncertain" ? "urgent" : level,
  categories,
  language: "en",
  register: "standard",
  failedLayers: [],
});

/** FR-23: a stand-in playful version (the English fields unchanged), as /api/restyle returns it. */
const restyled = ({ flow, language, english: e }) => ({
  kind: "restyled",
  restyled: true,
  flow,
  language,
  promptVersion: "style@v1",
  fields:
    flow === "prepare"
      ? { mainConcern: e.mainConcern, duration: e.duration.text, frequencyAndPattern: e.frequencyAndPattern, changesAndTriggers: e.changesAndTriggers, previousSupport: e.medicationAndSupport.previousSupport, worriesAndBarriers: e.worriesAndBarriers, questionsToAsk: e.questionsToAsk, whatToBring: e.whatToBring, notMentioned: e.notMentioned }
      : { whatYouWereTold: e.whatYouWereTold.map((x) => x.text), whatItMeans: e.whatItMeans.map((x) => x.plainMeaning), nextSteps: e.nextSteps.map((x) => x.action), unclearOrMissing: e.unclearOrMissing.map((x) => x.item) },
});
const PATOIS = JSON.parse(readFileSync(new URL("../config/languages.json", import.meta.url), "utf8")).languages.find((l) => l.code === "jam").nativeName;

/** API paths held open until released, so a wait's progress feed can be checked (`hold`). */
const held = new Map();
function hold(path) {
  let release;
  held.set(path, new Promise((r) => (release = r)));
  return () => {
    held.delete(path);
    release();
  };
}

/** Fake API: clear unless the text is one of the urgent probes below. */
async function fakeApi(page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    await held.get(url.pathname);
    const body = route.request().postData() ?? "";
    const json = (data) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    switch (url.pathname) {
      case "/api/screen":
        if (body.includes("overdose")) return json(gate("emergency", ["self_harm_or_suicide"]));
        if (body.includes("want to be here")) return json(gate("crisis", ["self_harm_or_suicide"]));
        return json(gate("clear"));
      case "/api/followups":
        return json(
          body.includes('"journey":"understand"')
            ? LETTER.followups
            : { kind: "followups", questions: [{ intent: "clarify_duration", question: "How long does the pain last each time?" }, { intent: "clarify_medicines", question: "How often do you take the paracetamol?" }] },
        );
      case "/api/summary":
        return json(SUMMARY);
      case "/api/extract":
        return json(LETTER.extract);
      case "/api/explain":
        return json(LETTER.explainDefault);
      case "/api/restyle":
        return json(restyled(JSON.parse(body)));
      default:
        return route.continue();
    }
  });
}

/** Interface text for the language being checked, by flat key; English where the locale has none. */
const flatten = (tree, prefix = "", out = {}) => {
  for (const [k, v] of Object.entries(tree)) {
    if (v && typeof v === "object") flatten(v, prefix ? `${prefix}.${k}` : k, out);
    else out[prefix ? `${prefix}.${k}` : k] = v;
  }
  return out;
};
const readLocale = (code) => flatten(JSON.parse(readFileSync(new URL(`../content/ui/${code}.json`, import.meta.url), "utf8")).messages);
const EN = readLocale("en");
let strings = EN;
const T = (key) => strings[key] ?? EN[key];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// A string the locale doesn't have yet shows in English, wrapped in Unicode isolates on right-to-left pages.
const exactOrFallback = (text) => new RegExp(`^[\u2066-\u2069]?${escape(text)}[\u2066-\u2069]?$`);
const anyOf = (...keys) => new RegExp(`^(${keys.map((k) => escape(T(k))).join("|")})$`);

const results = [];
let lang = "en";
let current = null; // the page being driven, for a screenshot if a step fails

async function check(page, name) {
  current = page;
  await page.waitForTimeout(700); // let step transitions and springs settle
  await page.addScriptTag({ content: AXE });
  const axe = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target.join(" ")).slice(0, 3) }));
  });
  // Large text (NFR: WCAG 1.4.4 / 1.4.10): double the root size and look for sideways scrolling.
  const overflow = await page.evaluate(async () => {
    const root = document.documentElement;
    const before = root.style.fontSize;
    root.style.fontSize = "200%";
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const W = root.clientWidth;
    const culprits =
      root.scrollWidth > W + 1
        ? [...document.body.querySelectorAll("*")]
            .filter((el) => el.getBoundingClientRect().right > W + 1 && ![...el.children].some((c) => c.getBoundingClientRect().right > W + 1))
            .slice(0, 3)
            .map((el) => `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""} "${(el.textContent ?? "").trim().slice(0, 40)}"`)
        : [];
    root.style.fontSize = before;
    return culprits.length ? culprits : root.scrollWidth > W + 1 ? ["(unknown element)"] : null;
  });
  const htmlLang = await page.evaluate(() => document.documentElement.lang);
  const heading = await page.evaluate(() => document.querySelector("h1")?.textContent?.trim() ?? "");
  results.push({ name: `[${lang}] ${name}`, axe, overflow, lang: htmlLang, heading });
}

/** Press a button, then let the step transition finish before touching the next screen. */
async function press(page, locator) {
  await locator.click();
  await page.waitForTimeout(700);
}
const next = (page) => press(page, page.getByRole("button", { name: T("prepare.actions.next"), exact: true }));

let newPage;

async function journeyPrepare() {
  const page = await newPage();
  await fakeApi(page);
  await page.goto(`${BASE}/`);
  await check(page, "landing");

  await page.goto(`${BASE}/prepare`);
  await page.getByText(T("prepare.who.options.other"), { exact: true }).click();
  await check(page, "J1 step 1 (someone else + age)");
  await next(page);
  await check(page, "J1 step 1 (errors shown)");
  await page.getByText(T("prepare.who.ageBands.adult"), { exact: true }).click();
  await next(page);
  await page.locator("textarea").first().fill("My knees hurt when I walk up the stairs.");
  await check(page, "J1 step 2 concern");
  await next(page);
  await page.getByText(T("prepare.timing.started.months"), { exact: true }).click();
  await page.getByText(T("prepare.timing.pattern.comes_and_goes"), { exact: true }).click();
  await check(page, "J1 step 3 timing");
  await next(page);
  await page.locator("textarea").first().fill("Worse in the morning.");
  await check(page, "J1 step 4 changes");
  let release = hold("/api/screen");
  await page.getByRole("button", { name: T("prepare.actions.next"), exact: true }).click();
  await page.locator("[data-progress-feed]").waitFor();
  await check(page, "J1 step check (progress feed)");
  release();
  await page.locator("[data-progress-feed]").waitFor({ state: "detached" });
  await page.waitForTimeout(700);
  await check(page, "J1 step 5 medicines");
  await press(page, page.getByRole("button", { name: anyOf("prepare.actions.skip", "prepare.actions.next") }).first());
  await check(page, "J1 step 6 worries");
  await press(page, page.getByRole("button", { name: anyOf("prepare.actions.skip", "prepare.actions.next") }).first());
  await check(page, "J1 follow-ups");
  await page.locator("textarea").first().fill("About an hour.");
  await press(page, page.getByRole("button", { name: T("prepare.followUps.continue"), exact: true }));
  await check(page, "J1 review");
  release = hold("/api/summary");
  await page.getByRole("button", { name: T("prepare.review.getSummary"), exact: true }).click();
  await page.locator("[data-progress-feed]").waitFor();
  await check(page, "J1 summary loading (progress feed)");
  release();
  await page.getByRole("heading", { name: T("result.title"), exact: true }).waitFor({ timeout: 15000 });
  await check(page, "J1 result (list)");
  await page.getByRole("button", { name: T("result.showOwnWords"), exact: true }).click();
  await page.getByRole("button", { name: T("result.hideOwnWords"), exact: true }).waitFor();
  await check(page, "J1 result (own words shown)");
  await page.getByRole("tab").last().click();
  await page.getByRole("tab", { selected: true }).last().waitFor();
  await check(page, "J1 result (clinician tab)");
  await page.getByRole("tab").first().click();
  // The fixture is a Patois result, so the playful toggle is offered (FR-23).
  await page.getByRole("button", { name: exactOrFallback(T("result.playful.turnOn").replace("{language}", PATOIS)) }).click();
  await page.getByText(exactOrFallback(T("result.playful.label"))).waitFor();
  await check(page, "J1 result (playful on)");
  await page.getByRole("button", { name: exactOrFallback(T("result.playful.turnOff")) }).click();
  await page.getByRole("button", { name: T("result.layout.toDeck"), exact: true }).click();
  await page.getByRole("button", { name: T("result.layout.toList"), exact: true }).waitFor();
  await check(page, "J1 result (card deck)");
  await page.close();
}

/** No language chosen yet (no cookie; the browser asks for this one): the chooser before a journey, and registration. */
async function languageScreens(code) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: code });
  try {
    const page = await context.newPage();
    await fakeApi(page);
    await page.goto(`${BASE}/prepare`);
    await page.getByRole("heading", { name: exactOrFallback(T("common.language.chooser.title")) }).waitFor();
    await check(page, "language chooser");
    await page.getByLabel(exactOrFallback(T("common.language.chooser.filterLabel"))).fill("zzzz");
    await check(page, "language chooser (no match)");
    await page.goto(`${BASE}/account`);
    await page.getByRole("tab", { name: T("account.modes.register"), exact: true }).click();
    await check(page, "account: create (language)");
    await page.close();
  } finally {
    await context.close();
  }
}

async function urgentScreens() {
  for (const [name, text] of [
    ["urgent: crisis", "I don't want to be here anymore"],
    ["urgent: emergency + self-harm", "I took an overdose"],
  ]) {
    const page = await newPage();
    await fakeApi(page);
    await page.goto(`${BASE}/prepare`);
    await page.getByText(T("prepare.who.options.self"), { exact: true }).click();
    await next(page);
    await page.locator("textarea").first().fill(text);
    await next(page);
    await page.waitForSelector("[data-level]");
    // Nothing but the static urgent content on an urgent screen (CLAUDE.md rule 3), not even the progress feed.
    if (await page.locator("[data-progress-feed]").count()) throw new Error(`${name}: progress feed on an urgent screen`);
    await check(page, name);
    await page.locator('[data-action="open-continue-check"]').click();
    await check(page, `${name} (continue check open)`);
    await page.close();
  }
}

async function journeyUnderstand() {
  const page = await newPage();
  await fakeApi(page);
  await page.goto(`${BASE}/understand`);
  await check(page, "J2 choose");
  await page.locator('[data-action="photo"]').click();
  await check(page, "J2 photo advice");
  await page.locator('input[type="file"]').first().setInputFiles(LETTER_PNG);
  await page.waitForSelector("textarea", { timeout: 15000 });
  await check(page, "J2 confirm words");
  await press(page, page.getByRole("button", { name: T("understand.confirm.confirm"), exact: true }));
  await check(page, "J2 follow-ups");
  const release = hold("/api/explain");
  await page.getByRole("button", { name: T("prepare.followUps.continue"), exact: true }).click();
  await page.getByRole("heading", { name: T("understand.status.makingTitle"), exact: true }).waitFor();
  await check(page, "J2 explanation loading (progress feed)");
  release();
  await page.waitForTimeout(800);
  await check(page, "J2 result");
  await page.getByRole("button", { name: T("explain.showSources"), exact: true }).click();
  await page.getByRole("button", { name: T("explain.hideSources"), exact: true }).waitFor();
  await check(page, "J2 result (letter's words shown)");
  await page.close();
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  for (const code of (process.env.A11Y_LANGS ?? "en").split(",").map((c) => c.trim()).filter(Boolean)) {
    lang = code;
    strings = { ...EN, ...readLocale(code) };
    await browser.contexts().at(-1)?.close();
    current = null;
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([{ name: "carenav_lang", value: code, url: BASE }]);
    newPage = () => context.newPage();
    await journeyPrepare();
    await urgentScreens();
    await journeyUnderstand();
    await languageScreens(code);
  }
} catch (e) {
  const shot = process.env.A11Y_FAIL_SCREENSHOT ?? "a11y-failure.png";
  await current?.screenshot({ path: shot }).catch(() => {});
  console.error(`Could not drive the journey after "${results.at(-1)?.name}" (screenshot: ${shot}).`);
  throw e;
} finally {
  await browser.close();
}

let failed = false;
for (const r of results) {
  const ok = r.axe.length === 0 && !r.overflow && r.lang;
  failed ||= !ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.name.padEnd(48)} "${r.heading.slice(0, 40)}"${r.overflow ? "  [scrolls sideways at 200% text]" : ""}${r.lang ? "" : "  [no html lang]"}`);
  for (const c of r.overflow ?? []) console.log(`        too wide: ${c}`);
  for (const v of r.axe) console.log(`        ${v.impact}: ${v.id} — ${v.help}\n          ${v.targets.join("\n          ")}`);
}
console.log(`\n${results.length} screens, ${results.filter((r) => r.axe.length || r.overflow || !r.lang).length} with problems`);
process.exit(failed ? 1 : 0);
