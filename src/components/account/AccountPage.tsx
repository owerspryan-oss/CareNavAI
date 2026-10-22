"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { TopBar } from "@/components/ui/TopBar";
import { accountCall } from "@/lib/client/account";
import type { LanguageNames } from "@/lib/result/view";
import { AuthForms } from "./AuthForms";
import { SavedList } from "./SavedList";
import { useAccountCopy } from "./useAccountCopy";
import { YourData } from "./YourData";
import styles from "./Account.module.css";

export interface AccountPageProps {
  /** The signed-in account, or null. */
  user: { email: string; createdAt: number } | null;
  invitesRequired: boolean;
  /** Requested on this machine: the "links appear in the dev inbox" hint. */
  devInbox: boolean;
  /** Language names for the saved list. */
  languages: LanguageNames;
}

/**
 * /account (FR-12/13/14, PRD §3.5): optional, never a gate. Signed out: sign in or register. Signed in:
 * saved summaries, export, delete everything.
 */
export function AccountPage({ user, invitesRequired, devInbox, languages }: AccountPageProps) {
  const c = useAccountCopy();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [deleted, setDeleted] = useState(false);

  async function signOut() {
    setSigningOut(true);
    await accountCall("/api/auth/logout", { body: {} });
    setSigningOut(false);
    router.refresh();
  }

  return (
    <div className={styles.page}>
      <TopBar backLabel={c.back} onBack={() => router.push("/")} confirmHome={false} />
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.title}>{c.title}</h1>
          {!user && <p className={styles.lead}>{c.lead}</p>}
        </div>

        {deleted && !user && (
          <div role="status">
            <Banner tone="info">{c.data.deleted}</Banner>
          </div>
        )}

        {user ? (
          <>
            <section className={styles.card} aria-labelledby="account-signed-in">
              <p id="account-signed-in" className={styles.signedIn}>
                {c.signedInAs(user.email)}
              </p>
              <Button variant="tertiary" onClick={() => void signOut()} loading={signingOut} loadingLabel={c.signedIn.signingOut}>
                {c.signedIn.signOut}
              </Button>
            </section>
            <SavedList languages={languages} />
            <YourData
              onDeleted={() => {
                setDeleted(true);
                router.refresh();
              }}
            />
          </>
        ) : (
          <AuthForms invitesRequired={invitesRequired} devInbox={devInbox} />
        )}
      </main>
    </div>
  );
}
