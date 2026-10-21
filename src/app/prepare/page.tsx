import type { Metadata } from "next";
import { connection } from "next/server";
import { PrepareFlow } from "@/components/prepare/PrepareFlow";
import { env } from "@/lib/config/env";
import { getUrgentContent } from "@/lib/content";

export const metadata: Metadata = {
  title: "Prepare for my appointment · CareNav AI",
};

export default async function PreparePage() {
  // Read limits at request time so a config change applies without a rebuild (CLAUDE.md rule 10).
  await connection();
  // Static urgent-screen content, built server-side so no server config reaches the client bundle.
  // TODO(epic-language): pass the interface language here once the picker sets it.
  const urgentContent = getUrgentContent("en");
  return <PrepareFlow maxChars={env().MAX_TEXT_CHARS} urgentContent={urgentContent} />;
}
