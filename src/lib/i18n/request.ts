import { cookies, headers } from "next/headers";
import { getUiLocale, needsLanguageChoice, resolveUiLanguage, UI_COOKIE } from "./locale";
import type { UiLocale } from "./messages";

/** The interface locale for this request: cookie, then Accept-Language, then English (AC-27.1). */
export async function requestUiLocale(): Promise<UiLocale> {
  const [c, h] = await Promise.all([cookies(), headers()]);
  return getUiLocale(resolveUiLanguage(c.get(UI_COOKIE)?.value, h.get("accept-language")));
}

/** True when this request has no chosen language yet, so a journey asks for one first. */
export async function requestNeedsLanguageChoice(): Promise<boolean> {
  return needsLanguageChoice((await cookies()).get(UI_COOKIE)?.value);
}
