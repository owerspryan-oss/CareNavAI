import { uiLanguageCookie } from "@/lib/i18n/messages";

/**
 * The language the person reads the app in (2026-10-25): sets the interface cookie at once, then saves it
 * to the account when signed in (the server ignores it for guests). Never throws: a failed save leaves
 * the cookie, so the interface still changes.
 */
export async function chooseLanguage(code: string): Promise<void> {
  document.cookie = uiLanguageCookie(code);
  try {
    await fetch("/api/account/language", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: code }),
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    // The cookie is set; the account keeps its earlier language.
  }
}
