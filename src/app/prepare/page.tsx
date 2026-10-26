import type { Metadata } from "next";
import { connection } from "next/server";
import { LanguageFirst } from "@/components/i18n/LanguageChooser";
import { PrepareFlow } from "@/components/prepare/PrepareFlow";
import { languageNames, languagesConfig } from "@/lib/config";
import { env } from "@/lib/config/env";
import { getUrgentContent } from "@/lib/content";
import { demoPreparePresets } from "@/lib/demo/presets";
import { requestNeedsLanguageChoice, requestUiLocale } from "@/lib/i18n/request";

export async function generateMetadata(): Promise<Metadata> {
  const { messages } = await requestUiLocale();
  return { title: `${messages.common.meta.prepareTitle} · CareNav AI` };
}

/**
 * Voice input in every configured language unless switched off for it (config/languages.json
 * `voiceDisabled`). Product owner, 2026-10-26: open dictation to all languages; `sttTested` still
 * records which languages have actually been tried, for Tier A sign-off (AC-28.2).
 */
function voiceEnabled(language: string): boolean {
  const signoff = languagesConfig.languages.find((l) => l.code === language)?.signoff;
  return !!signoff && !signoff.voiceDisabled;
}

export default async function PreparePage() {
  // Read limits at request time so a config change applies without a rebuild (CLAUDE.md rule 10).
  await connection();
  // Static urgent-screen content in the interface language (English if it has no file), built
  // server-side so no server config reaches the client bundle.
  const { language } = await requestUiLocale();
  const urgentContent = getUrgentContent(language);
  const e = env();
  // No language chosen yet: ask first, then the journey opens in it (and its results follow it).
  return (
    <LanguageFirst needed={await requestNeedsLanguageChoice()}>
      <PrepareFlow
        maxChars={e.MAX_TEXT_CHARS}
        contextMaxChars={e.MAX_SCREEN_CONTEXT_CHARS}
        urgentContent={urgentContent}
        languages={languageNames()}
        voiceMaxSeconds={voiceEnabled(language) ? e.MAX_AUDIO_SECONDS : null}
        demo={e.DEMO_MODE ? demoPreparePresets() : undefined}
      />
    </LanguageFirst>
  );
}
