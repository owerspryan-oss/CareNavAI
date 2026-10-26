"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { LanguageChoices } from "@/components/i18n/LanguageChooser";
import { useUi } from "@/components/i18n/UiProvider";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { accountCall, looksLikeEmail } from "@/lib/client/account";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/rules";
import { Field } from "./Field";
import { useAccountCopy } from "./useAccountCopy";
import styles from "./Account.module.css";

type Mode = "signIn" | "register";

/**
 * Sign in (password, or "email me a link") and create an account (FR-12, FR-13). The invite field shows
 * only when the pilot setting requires one (AC-12.4). Errors are static copy mapped from a code.
 */
export function AuthForms({ invitesRequired, devInbox }: { invitesRequired: boolean; devInbox: boolean }) {
  const c = useAccountCopy();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  /** The account's language, pre-filled from the current interface language. */
  const [language, setLanguage] = useState(useUi().language);
  const [busy, setBusy] = useState<"submit" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linkSent, setLinkSent] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setLinkSent(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLinkSent(false);
    if (!looksLikeEmail(email)) return setError(c.errors.emailInvalid);
    if (mode === "register" && password.length < MIN_PASSWORD_LENGTH) return setError(c.register.tooShort);
    setBusy("submit");
    setError(null);
    const res =
      mode === "signIn"
        ? await accountCall("/api/auth/login", { body: { email, password } })
        : await accountCall("/api/auth/register", { body: { email, password, inviteCode: invitesRequired ? inviteCode : null, language } });
    setBusy(null);
    if (!res.ok) return setError(c.error(res.error));
    setPassword("");
    router.refresh();
  }

  async function sendLink() {
    if (!looksLikeEmail(email)) return setError(c.errors.emailInvalid);
    setBusy("link");
    setError(null);
    const res = await accountCall("/api/auth/magic/request", { body: { email } });
    setBusy(null);
    if (!res.ok) return setError(c.error(res.error));
    setLinkSent(true);
  }

  return (
    <section className={styles.card} aria-label={c.modeLabel}>
      <SegmentedControl<Mode>
        label={c.modeLabel}
        idPrefix="account"
        value={mode}
        onChange={switchMode}
        options={[
          { value: "signIn", label: c.modes.signIn },
          { value: "register", label: c.modes.register },
        ]}
      />
      <form id="account-panel" role="tabpanel" aria-labelledby={`account-tab-${mode}`} className={styles.form} onSubmit={submit} noValidate>
        <Field id="account-email" label={c.fields.email} type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Field
          id="account-password"
          label={c.fields.password}
          hint={mode === "register" ? c.fields.passwordHint : undefined}
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {mode === "register" && (
          <div className={styles.field}>
            {/* Visible title for sighted readers; the radio group's own legend names it for screen readers. */}
            <p className={styles.label} aria-hidden="true">
              {c.fields.language}
            </p>
            <p className={styles.hint}>{c.fields.languageHint}</p>
            <LanguageChoices name="account-language" legend={c.fields.language} legendHidden value={language} onChange={setLanguage} bounded />
          </div>
        )}
        {mode === "register" && invitesRequired && (
          <Field id="account-invite" label={c.fields.inviteCode} hint={c.fields.inviteHint} autoComplete="off" autoCapitalize="characters" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} required />
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" fullWidth loading={busy === "submit"} loadingLabel={mode === "signIn" ? c.signIn.submitting : c.register.submitting}>
          {mode === "signIn" ? c.signIn.submit : c.register.submit}
        </Button>
      </form>

      {mode === "signIn" && (
        <div className={styles.linkBlock}>
          <p className={styles.muted}>{c.signIn.linkLead}</p>
          <Button variant="tertiary" fullWidth onClick={() => void sendLink()} loading={busy === "link"} loadingLabel={c.signIn.linkSending}>
            {c.signIn.linkButton}
          </Button>
          <div role="status" aria-live="polite" className={styles.linkStatus}>
            {linkSent && (
              <>
                <p>{c.signIn.linkSent}</p>
                {devInbox && (
                  <p className={styles.muted}>
                    {c.signIn.devInbox}{" "}
                    <Link href="/dev/inbox" className={styles.textLink}>
                      {c.signIn.devInboxLink}
                    </Link>
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
