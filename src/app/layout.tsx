import type { Metadata, Viewport } from "next";
import { UiProvider } from "@/components/i18n/UiProvider";
import { languagesConfig } from "@/lib/config";
import { uiLanguages } from "@/lib/i18n/locale";
import { requestUiLocale } from "@/lib/i18n/request";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { messages } = await requestUiLocale();
  return { title: "CareNav AI", description: messages.common.meta.description };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/** Picker options: every language with an interface file, by its own name (AC-27.1). */
function languageOptions() {
  const codes = new Set(uiLanguages());
  return languagesConfig.languages
    .filter((l) => codes.has(l.code))
    .map((l) => ({ code: l.code, nativeName: l.nativeName, englishName: l.englishName, dir: l.dir === "rtl" ? ("rtl" as const) : ("ltr" as const) }));
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // AC-27.3: lang and dir follow the interface language, so right-to-left layouts mirror.
  const locale = await requestUiLocale();
  return (
    <html lang={locale.language} dir={locale.dir}>
      <body>
        <UiProvider locale={locale} options={languageOptions()}>
          {children}
        </UiProvider>
      </body>
    </html>
  );
}
