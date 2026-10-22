import type { Metadata } from "next";
import { AccountPage } from "@/components/account/AccountPage";
import { pageIsLocal, pageUser } from "@/lib/auth/page";
import { publicUser } from "@/lib/auth/respond";
import { env } from "@/lib/config/env";
import { requestUiLocale } from "@/lib/i18n/request";

export async function generateMetadata(): Promise<Metadata> {
  const { messages } = await requestUiLocale();
  return { title: `${messages.common.meta.accountTitle} · CareNav AI`, robots: { index: false, follow: false } };
}

/** Optional accounts (FR-12/13, PRD §3.5). Every journey works without one. */
export default async function Account() {
  const user = await pageUser();
  return <AccountPage user={user ? publicUser(user) : null} invitesRequired={env().PILOT_INVITE_REQUIRED} devInbox={await pageIsLocal()} />;
}
