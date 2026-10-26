"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { accountCall } from "@/lib/client/account";
import type { SaveStatus } from "@/lib/summaries/status";
import { useResultCopy } from "./copy";
import styles from "./FeedbackPrompt.module.css";

/**
 * After a result only (PRD §3.2 step 10, §3.5). Signed in: one quiet line saying whether the result was
 * saved (FR-14). Signed out: a quiet offer to create an account, opening in a new tab so this result
 * stays on screen. Optional and never a gate.
 */
export function AccountPrompt({ saved }: { saved?: SaveStatus }) {
  const c = useResultCopy().account;
  const [signedOut, setSignedOut] = useState(false);

  useEffect(() => {
    if (saved) return; // only a signed-in person's result carries a save status
    let live = true;
    void accountCall<{ user: unknown }>("/api/auth/me", { method: "GET" }).then((res) => {
      if (live && res.ok && res.body.user === null) setSignedOut(true);
    });
    return () => {
      live = false;
    };
  }, [saved]);

  if (saved) {
    return (
      <p className={`${styles.card} ${styles.saved}`} role="status">
        <span>{saved === "saved" ? c.saved : saved === "off" ? c.saveOff : c.saveFailed}</span>
        {saved === "saved" && (
          <Link href="/account" target="_blank" rel="noopener" className={styles.accountLink}>
            {c.savedLink} <span className="sr-only">{c.newTab}</span>
          </Link>
        )}
      </p>
    );
  }
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
