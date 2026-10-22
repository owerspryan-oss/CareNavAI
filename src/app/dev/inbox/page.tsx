import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { devInbox } from "@/lib/auth/magic";
import { isLocalHost } from "@/lib/security/local";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Dev inbox · CareNav AI", robots: { index: false, follow: false }, referrer: "no-referrer" };

const time = (ms: number) => new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/**
 * Dev inbox (AC-13.1): the local build's stand-in for email. Magic links live only in this server
 * process's memory and are shown only to requests addressed to this machine, like /admin/usage.
 */
export default async function DevInboxPage() {
  if (!isLocalHost((await headers()).get("host"))) notFound();
  const items = devInbox();
  return (
    <main className={styles.page} lang="en" dir="ltr">
      <h1 className={styles.title}>Dev inbox</h1>
      <p className={styles.lead}>Sign-in links sent in the last 15 minutes, newest first. Held in memory only: restarting the server empties this page.</p>
      {items.length === 0 ? (
        <p className={styles.card}>No links yet. Ask for one on the account page.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((i) => (
            <li key={i.link} className={styles.card}>
              <p className={styles.to}>To {i.to}</p>
              <p className={styles.muted}>
                Sent {time(i.sentAt)}, works until {time(i.expiresAt)} (once)
              </p>
              <a href={i.link} className={styles.link}>
                Open sign-in link
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
