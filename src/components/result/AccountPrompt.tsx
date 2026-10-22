"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { accountCall } from "@/lib/client/account";
import { useResultCopy } from "./copy";
import styles from "./FeedbackPrompt.module.css";

/**
 * After a result only (PRD §3.2 step 10, §3.5): a quiet offer to create an account, shown when nobody is
 * signed in. Optional and never a gate; it opens in a new tab so this result stays on screen.
 */
export function AccountPrompt() {
  const c = useResultCopy().account;
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    let live = true;
    void accountCall<{ user: unknown }>("/api/auth/me", { method: "GET" }).then((res) => {
      if (live && res.ok && res.body.user === null) setSignedOut(true);
    });
    return () => {
      live = false;
    };
  }, []);

  if (!signedOut) return null;
  return (
    <section className={styles.card} aria-labelledby="account-prompt-title">
      <div>
        <h2 id="account-prompt-title" className={styles.title}>
          {c.title}
        </h2>
        <p className={styles.lead}>{c.lead}</p>
      </div>
      <Link href="/account" target="_blank" rel="noopener" className={styles.accountLink}>
        {c.link} <span className="sr-only">{c.newTab}</span>
      </Link>
    </section>
  );
}
