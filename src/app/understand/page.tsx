import type { Metadata } from "next";
import { connection } from "next/server";
import { UnderstandFlow } from "@/components/understand/UnderstandFlow";
import { languagesConfig } from "@/lib/config";
import { env } from "@/lib/config/env";
import { getDisclaimers, getUrgentContent } from "@/lib/content";
import { demoLetterPresets } from "@/lib/demo/presets";
import type { LanguageNames } from "@/lib/result/view";

export const metadata: Metadata = {
  title: "Understand what I was told · CareNav AI",
};

/** Language names and direction for the result view and the "Show me this in" picker (CLAUDE.md rule 10). */
function languageNames(): LanguageNames {
  return Object.fromEntries(
    languagesConfig.languages.map((l) => [l.code, { englishName: l.englishName, nativeName: l.nativeName, dir: l.dir }]),
  );
}

/** Journey 2 (PRD §3.3). Limits and static content are read here, on the server, and passed down. */
export default async function UnderstandPage() {
  // Read limits at request time so a config change applies without a rebuild (CLAUDE.md rule 10).
  await connection();
  const e = env();
  // TODO(epic-language): pass the interface language here once the picker sets it.
  return (
    <UnderstandFlow
      maxImagePx={e.MAX_IMAGE_PX}
      maxLetterChars={e.MAX_LETTER_CHARS}
      maxAnswerChars={e.MAX_TEXT_CHARS}
      urgentContent={getUrgentContent("en")}
      providerNotice={getDisclaimers("en").content.guestProviderNotice}
      languages={languageNames()}
      demo={e.DEMO_MODE ? demoLetterPresets() : undefined}
    />
  );
}
