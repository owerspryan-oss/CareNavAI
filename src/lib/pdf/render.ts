import { chromium, type Browser } from "playwright-core";
import { env } from "@/lib/config/env";

/**
 * Headless Chromium renderer (ADR-008). One shared browser, a fresh context per PDF.
 * JavaScript is off and every request except data: URLs is aborted (CONTEXT.md §13),
 * so a document can never reach the network.
 */
let browser: Promise<Browser> | undefined;

function getBrowser(): Promise<Browser> {
  if (!browser) {
    const launching = chromium.launch({ executablePath: env().CHROMIUM_PATH, headless: true });
    browser = launching;
    launching.then(
      (b) => b.on("disconnected", () => (browser = undefined)),
      () => (browser = undefined),
    );
  }
  return browser;
}

export async function htmlToPdf(html: string, footer: string): Promise<Buffer> {
  const context = await (await getBrowser()).newContext({ javaScriptEnabled: false });
  try {
    await context.route("**/*", (route) => (route.request().url().startsWith("data:") ? route.continue() : route.abort("blockedbyclient")));
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: "load" });
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      footerTemplate: footer,
    });
  } finally {
    await context.close();
  }
}

/** For tests and scripts: close the shared browser so the process can exit. */
export async function closeBrowser(): Promise<void> {
  const b = browser;
  browser = undefined;
  if (b) await (await b).close();
}
