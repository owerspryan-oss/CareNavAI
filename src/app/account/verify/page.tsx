import type { Metadata } from "next";
import { VerifyLink } from "@/components/account/VerifyLink";
import { requestUiLocale } from "@/lib/i18n/request";

export async function generateMetadata(): Promise<Metadata> {
  const { messages } = await requestUiLocale();
  // The token is in the URL: never index it, never send it on as a referrer.
  return { title: `${messages.account.verify.title} · CareNav AI`, robots: { index: false, follow: false }, referrer: "no-referrer" };
}

/** Magic-link landing (FR-13). Nothing happens until the button is pressed. */
export default async function Verify({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  return <VerifyLink token={typeof token === "string" ? token : ""} />;
}
