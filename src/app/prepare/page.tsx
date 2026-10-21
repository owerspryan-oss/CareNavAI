import type { Metadata } from "next";
import { connection } from "next/server";
import { PrepareFlow } from "@/components/prepare/PrepareFlow";
import { env } from "@/lib/config/env";

export const metadata: Metadata = {
  title: "Prepare for my appointment · CareNav AI",
};

export default async function PreparePage() {
  // Read limits at request time so a config change applies without a rebuild (CLAUDE.md rule 10).
  await connection();
  return <PrepareFlow maxChars={env().MAX_TEXT_CHARS} />;
}
