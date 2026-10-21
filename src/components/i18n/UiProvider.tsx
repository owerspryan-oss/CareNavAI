"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UiLocale } from "@/lib/i18n/messages";

/** A language the picker offers, by its own name (AC-27.1). */
export interface UiLanguageOption {
  code: string;
  nativeName: string;
  dir: "ltr" | "rtl";
}

interface UiContextValue extends UiLocale {
  options: UiLanguageOption[];
}

const UiContext = createContext<UiContextValue | null>(null);

/** Interface text for the request's language, built on the server (requestUiLocale) and passed down once. */
export function UiProvider({ locale, options, children }: { locale: UiLocale; options: UiLanguageOption[]; children: ReactNode }) {
  return <UiContext.Provider value={{ ...locale, options }}>{children}</UiContext.Provider>;
}

export function useUi(): UiContextValue {
  const ui = useContext(UiContext);
  if (!ui) throw new Error("useUi outside <UiProvider>");
  return ui;
}
