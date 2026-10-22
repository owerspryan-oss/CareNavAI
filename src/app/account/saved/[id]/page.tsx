import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { SavedSummary } from "@/components/account/SavedSummary";
import { pageUser } from "@/lib/auth/page";
import { languageNames } from "@/lib/config";
import { getUrgentContent } from "@/lib/content";
import { db } from "@/lib/db";
import { requestUiLocale } from "@/lib/i18n/request";
import { dataKey, getSummary } from "@/lib/summaries/store";

export async function generateMetadata(): Promise<Metadata> {
  const { messages } = await requestUiLocale();
  return { title: `${messages.account.saved.heading} · CareNav AI`, robots: { index: false, follow: false } };
}

/** One saved summary, decrypted for its owner only and shown read-only (FR-14, AC-14.3). */
export default async function SavedSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser();
  if (!user) redirect("/account");
  const { id } = await params;
  const key = dataKey();
  const found = key ? getSummary(db(), key, user.id, id) : null;
  if (!found?.result) notFound();
  const { language } = await requestUiLocale();
  return <SavedSummary result={found.result} urgentContent={getUrgentContent(language)} languages={languageNames()} />;
}
