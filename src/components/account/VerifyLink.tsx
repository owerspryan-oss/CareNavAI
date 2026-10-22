"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TopBar } from "@/components/ui/TopBar";
import { accountCall } from "@/lib/client/account";
import { Field } from "./Field";
import { useAccountCopy } from "./useAccountCopy";
import styles from "./Account.module.css";

/**
 * /account/verify (FR-13): the magic link lands here and is used only when the person presses the
 * button, so an email scanner that opens the link can't use it up. A new account may need an invite.
 */
export function VerifyLink({ token }: { token: string }) {
  const c = useAccountCopy();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [needInvite, setNeedInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(!/^[A-Za-z0-9_-]{43}$/.test(token));

  async function verify(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await accountCall("/api/auth/magic/verify", { body: { token, inviteCode: needInvite ? inviteCode : null } });
    setBusy(false);
    if (res.ok) {
      router.replace("/account");
      router.refresh();
      return;
    }
    if (res.error === "invite_required") return setNeedInvite(true);
    if (res.error === "link_invalid" || res.error === "invalid_request") return setInvalid(true);
    setError(c.error(res.error));
  }

  return (
    <div className={styles.page}>
      <TopBar backLabel={c.back} onBack={() => router.push("/")} confirmHome={false} />
      <main className={styles.main}>
        <div className={styles.intro}>
          <h1 className={styles.title}>{c.verify.title}</h1>
        </div>
        {invalid ? (
          <section className={styles.card}>
            <p role="alert">{c.verify.invalid}</p>
            <ButtonLink href="/account" variant="tertiary">
              {c.verify.newLink}
            </ButtonLink>
          </section>
        ) : (
          <form className={`${styles.card} ${styles.form}`} onSubmit={verify}>
            <p className={styles.lead}>{needInvite ? c.verify.inviteNeeded : c.verify.lead}</p>
            {needInvite && (
              <Field id="verify-invite" label={c.fields.inviteCode} hint={c.fields.inviteHint} autoComplete="off" autoCapitalize="characters" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
            )}
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" fullWidth loading={busy} loadingLabel={c.signIn.submitting}>
              {c.verify.button}
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
