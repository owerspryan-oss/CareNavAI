import type { Metadata } from "next";
import { connection } from "next/server";
import { UnderstandFlow } from "@/components/understand/UnderstandFlow";
import { languageNames } from "@/lib/config";
import { env } from "@/lib/config/env";
import { getDisclaimers, getUrgentContent } from "@/lib/content";
import { demoLetterPresets } from "@/lib/demo/presets";
import { requestUiLocale } from "@/lib/i18n/request";

export async function generateMetadata(): Promise<Metadata> {
  const { messages } = await requestUiLocale();
  return { title: `${messages.common.meta.understandTitle} · CareNav AI` };
}

/** Journey 2 (PRD §3.3). Limits and static content are read here, on the server, and passed down. */
export default async function UnderstandPage() {
  // Read limits at request time so a config change applies without a rebuild (CLAUDE.md rule 10).
  await connection();
  const e = env();
  // Static content in the interface language (English where it has no file yet).
  const { language } = await requestUiLocale();
  return (
    <UnderstandFlow
      maxImagePx={e.MAX_IMAGE_PX}
      maxLetterChars={e.MAX_LETTER_CHARS}
      maxAnswerChars={e.MAX_TEXT_CHARS}
      urgentContent={getUrgentContent(language)}
      providerNotice={getDisclaimers(language).content.guestProviderNotice}
      languages={languageNames()}
      demo={e.DEMO_MODE ? demoLetterPresets() : undefined}
    />
  );
}
