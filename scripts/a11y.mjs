// T-18 accessibility check: `npm run test:a11y` (with `npm run dev` already running).
//
// Drives both journeys in a phone-sized browser and runs axe (WCAG 2.1 A/AA) on every screen, then
// checks the same screens at 200% text size for sideways scrolling. The API is faked from the test
// fixtures so every screen is reachable without OPENAI_API_KEY. That is a UI test only: the real
// gate is covered by `npm test` and `npm run test:urgency`. Exits 1 on any violation.

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { chromium } from "playwright-core";

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const BASE = process.env.A11Y_BASE_URL ?? "http://localhost:3000";
const fixture = (name) => JSON.parse(readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url), "utf8"));
const LETTER = fixture("gp-letter-explain.json");
const SUMMARY = fixture("marcia-summary.json");
const LETTER_PNG = new URL("../demo/letter/gp-letter.png", import.meta.url).pathname;

/** A gate result with no user text, as /api/screen returns it. */
const gate = (level, categories = []) => ({
  level,
  messageKey: level === "clear" ? null : level === "uncertain" ? "urgent" : level,
  categories,
  language: "en",
  register: "standard",
  failedLayers: [],
});

/** Fake API: clear unless the text is one of the urgent probes below. */
async function fakeApi(page) {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
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
      default:
        return route.continue();
    }
  });
}

const results = [];
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
  const lang = await page.evaluate(() => document.documentElement.lang);
  const heading = await page.evaluate(() => document.querySelector("h1")?.textContent?.trim() ?? "");
  results.push({ name, axe, overflow, lang, heading });
}

/** Press a button, then let the step transition finish before touching the next screen. */
async function press(page, locator) {
  await locator.click();
  await page.waitForTimeout(700);
}
const next = (page) => press(page, page.getByRole("button", { name: "Next", exact: true }));

async function journeyPrepare(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fakeApi(page);
  await page.goto(`${BASE}/`);
  await check(page, "landing");

  await page.goto(`${BASE}/prepare`);
  await page.getByText("Someone else", { exact: true }).click();
  await check(page, "J1 step 1 (someone else + age)");
  await next(page);
  await check(page, "J1 step 1 (errors shown)");
  await page.getByText("18 or over").click();
  await next(page);
  await page.locator("textarea").first().fill("My knees hurt when I walk up the stairs.");
  await check(page, "J1 step 2 concern");
  await next(page);
  await page.getByText("1 to 6 months ago").click();
  await page.getByText("It comes and goes").click();
  await check(page, "J1 step 3 timing");
  await next(page);
  await page.locator("textarea").first().fill("Worse in the morning.");
  await check(page, "J1 step 4 changes");
  await next(page);
  await check(page, "J1 step 5 medicines");
  await press(page, page.getByRole("button", { name: /Skip this step|Next/ }).first());
  await check(page, "J1 step 6 worries");
  await press(page, page.getByRole("button", { name: /Skip this step|Next/ }).first());
  await check(page, "J1 follow-ups");
  await page.locator("textarea").first().fill("About an hour.");
  await press(page, page.getByRole("button", { name: /Continue|Next/ }).first());
  await check(page, "J1 review");
  await page.getByRole("button", { name: "Get my summary" }).click();
  await page.getByRole("heading", { name: "Here's your summary" }).waitFor({ timeout: 15000 });
  await check(page, "J1 result (list)");
  await page.getByRole("button", { name: "Show my words" }).click();
  await page.getByRole("button", { name: "Hide my words" }).waitFor();
  await check(page, "J1 result (own words shown)");
  await page.getByRole("tab").last().click();
  await page.getByRole("tab", { selected: true }).last().waitFor();
  await check(page, "J1 result (clinician tab)");
  await page.getByRole("tab").first().click();
  await page.getByRole("button", { name: "One card at a time" }).click();
  await page.getByRole("button", { name: "Show as a list" }).waitFor();
  await check(page, "J1 result (card deck)");
  await page.close();
}

async function urgentScreens(browser) {
  for (const [name, text] of [
    ["urgent: crisis", "I don't want to be here anymore"],
    ["urgent: emergency + self-harm", "I took an overdose"],
  ]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await fakeApi(page);
    await page.goto(`${BASE}/prepare`);
    await page.getByText("Me", { exact: true }).click();
    await next(page);
    await page.locator("textarea").first().fill(text);
    await next(page);
    await page.waitForSelector("[data-level]");
    await check(page, name);
    await page.locator('[data-action="open-continue-check"]').click();
    await check(page, `${name} (continue check open)`);
    await page.close();
  }
}

async function journeyUnderstand(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fakeApi(page);
  await page.goto(`${BASE}/understand`);
  await check(page, "J2 choose");
  await page.locator('[data-action="photo"]').click();
  await check(page, "J2 photo advice");
  await page.locator('input[type="file"]').first().setInputFiles(LETTER_PNG);
  await page.waitForSelector("textarea", { timeout: 15000 });
  await check(page, "J2 confirm words");
  await press(page, page.getByRole("button", { name: "This is right, explain it" }));
  await check(page, "J2 follow-ups");
  await press(page, page.getByRole("button", { name: "Continue", exact: true }));
  await page.waitForTimeout(800);
  await check(page, "J2 result");
  await page.getByRole("button", { name: "Show letter's words" }).click();
  await page.getByRole("button", { name: /Hide letter/ }).waitFor();
  await check(page, "J2 result (letter's words shown)");
  await page.close();
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  await journeyPrepare(browser);
  await urgentScreens(browser);
  await journeyUnderstand(browser);
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
