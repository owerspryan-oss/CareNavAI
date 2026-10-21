import { cookies, headers } from "next/headers";
import { getUiLocale, resolveUiLanguage, UI_COOKIE } from "./locale";
import type { UiLocale } from "./messages";

/** The interface locale for this request: cookie, then Accept-Language, then English (AC-27.1). */
export async function requestUiLocale(): Promise<UiLocale> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return getUiLocale(resolveUiLanguage(c.get(UI_COOKIE)?.value, h.get("accept-language")));
}
