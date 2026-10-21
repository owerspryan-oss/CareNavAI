import type { Metadata } from "next";
import { connection } from "next/server";
import { PrepareFlow } from "@/components/prepare/PrepareFlow";
import { languagesConfig } from "@/lib/config";
import { env } from "@/lib/config/env";
import { getUrgentContent } from "@/lib/content";
import { demoPreparePresets } from "@/lib/demo/presets";
import { requestUiLocale } from "@/lib/i18n/request";
import type { LanguageNames } from "@/lib/result/view";

export async function generateMetadata(): Promise<Metadata> {
  const { messages } = await requestUiLocale();
  return { title: `${messages.common.meta.prepareTitle} · CareNav AI` };
}

/** Language names and direction for the result view (config/languages.json, CLAUDE.md rule 10). */
function languageNames(): LanguageNames {
  return Object.fromEntries(
    languagesConfig.languages.map((l) => [l.code, { englishName: l.englishName, nativeName: l.nativeName, dir: l.dir }]),
  );
}

export default async function PreparePage() {
  // Read limits at request time so a config change applies without a rebuild (CLAUDE.md rule 10).
  await connection();
  // Static urgent-screen content in the interface language (English if it has no file), built
  // server-side so no server config reaches the client bundle.
  const urgentContent = getUrgentContent((await requestUiLocale()).language);
  const e = env();
  return (
    <PrepareFlow
      maxChars={e.MAX_TEXT_CHARS}
      urgentContent={urgentContent}
      languages={languageNames()}
      demo={e.DEMO_MODE ? demoPreparePresets() : undefined}
    />
  );
}
