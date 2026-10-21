import type { Metadata } from "next";
import { connection } from "next/server";
import { PrepareFlow } from "@/components/prepare/PrepareFlow";
import type { ResultStatics } from "@/components/result/ResultView";
import { urgentMessageKeySchema } from "@/lib/ai/schemas";
import { languagesConfig } from "@/lib/config";
import { env } from "@/lib/config/env";
import { draftLabelEnabled, getDisclaimers, getUrgentMessage } from "@/lib/content";

export const metadata: Metadata = {
  title: "Prepare for my appointment · CareNav AI",
};

/** Static content for the result view: urgent banner text, DRAFT label and language names. English master for now. */
function resultStatics(): ResultStatics {
  return {
    urgentMessages: Object.fromEntries(
      urgentMessageKeySchema.options.map((k) => [k, getUrgentMessage(k, "en").message]),
    ) as ResultStatics["urgentMessages"],
    showDraftLabel: draftLabelEnabled(),
    draftLabel: getDisclaimers("en").content.draftLabel,
    languages: Object.fromEntries(
      languagesConfig.languages.map((l) => [l.code, { englishName: l.englishName, nativeName: l.nativeName, dir: l.dir }]),
    ),
  };
}

export default async function PreparePage() {
  // Read limits at request time so a config change applies without a rebuild (CLAUDE.md rule 10).
  await connection();
  return <PrepareFlow maxChars={env().MAX_TEXT_CHARS} statics={resultStatics()} />;
}
