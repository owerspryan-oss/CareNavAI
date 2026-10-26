"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { accountCall } from "@/lib/client/account";
import { useAccountCopy } from "./useAccountCopy";
import styles from "./Account.module.css";

/** Export everything as one file, or delete the account and all of it in one action (AC-14.4). */
export function YourData({ onDeleted }: { onDeleted: () => void }) {
  const copy = useAccountCopy();
  const c = copy.data;
  const [state, setState] = useState<"idle" | "exporting" | "confirm" | "deleting">("idle");
  const [error, setError] = useState<string | null>(null);

  async function exportData() {
    setState("exporting");
    setError(null);
    try {
      const res = await fetch("/api/account/export", { method: "POST", cache: "no-store", signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error("export");
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "carenav-ai-export.json";
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError(c.exportFailed);
    }
    setState("idle");
  }

  async function deleteAccount() {
    setState("deleting");
    setError(null);
    const res = await accountCall("/api/account/delete", { body: { confirm: true } });
    if (res.ok) return onDeleted();
    setState("confirm");
    setError(c.deleteFailed);
  }

  return (
    <section className={styles.section} aria-labelledby="data-heading">
      <h2 id="data-heading" className={styles.heading}>
        {c.heading}
      </h2>
      <div className={styles.card}>
        <p className={styles.muted}>{c.lead}</p>
        <Button variant="tertiary" fullWidth onClick={() => void exportData()} loading={state === "exporting"} loadingLabel={c.exporting}>
          {c.export}
        </Button>
        {state === "confirm" || state === "deleting" ? (
          <div className={styles.confirm} role="group" aria-labelledby="delete-account-confirm">
            <p id="delete-account-confirm" className={styles.warning}>
              {c.deleteConfirm}
            </p>
            <div className={styles.actions}>
              <Button variant="tertiary" onClick={() => setState("idle")} disabled={state === "deleting"}>
                {copy.saved.cancel}
              </Button>
              <Button variant="primary" onClick={() => void deleteAccount()} loading={state === "deleting"} loadingLabel={c.deleting}>
                {c.deleteYes}
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="link" onClick={() => setState("confirm")}>
            {c.deleteAccount}
          </Button>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
