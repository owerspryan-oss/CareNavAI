"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { useUi } from "@/components/i18n/UiProvider";
import { accountCall } from "@/lib/client/account";
import { downloadPdf, type PdfBody } from "@/lib/client/pdf";
import { format } from "@/lib/i18n/messages";
import type { LanguageNames } from "@/lib/result/view";
import type { SavedResult, SummaryMeta } from "@/lib/summaries/store";
import { useAccountCopy } from "./useAccountCopy";
import styles from "./Account.module.css";

type List = { saving: boolean; summaries: SummaryMeta[] };

/** The interface language's date and time, always with Western digits; English is British English. */
function when(ms: number, language: string): string {
  const opts: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short", numberingSystem: "latn" };
  try {
    return new Intl.DateTimeFormat(language === "en" ? "en-GB" : language, opts).format(ms);
  } catch {
    return new Intl.DateTimeFormat("en-GB", opts).format(ms);
  }
}

/**
 * Saved summaries (FR-14, AC-14.3): listed from metadata only; open, download the PDF again, or delete
 * one (with a confirm step). Each PDF is made from the saved result by the same /api/pdf path as before.
 */
export function SavedList({ languages }: { languages: LanguageNames }) {
  const c = useAccountCopy();
  const { messages, language } = useUi();
  const [list, setList] = useState<List | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<{ id: string; action: "pdf" | "delete" } | null>(null);
  const [rowError, setRowError] = useState<{ id: string; text: string } | null>(null);

  const fetchList = useCallback(
    () =>
      accountCall<List>("/api/summaries", { method: "GET" }).then((res) => {
        if (res.ok) setList(res.body);
        else setFailed(true);
      }),
    [],
  );

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  function retry() {
    setFailed(false);
    void fetchList();
  }

  async function pdf(id: string) {
    setBusy({ id, action: "pdf" });
    setRowError(null);
    const res = await accountCall<{ summary: { result: SavedResult } }>(`/api/summaries/${id}`, { method: "GET" });
    const ok = res.ok && (await downloadPdf({ flow: res.body.summary.result.flow, english: res.body.summary.result.english, user: res.body.summary.result.user } as PdfBody));
    setBusy(null);
    if (!ok) setRowError({ id, text: !res.ok && res.error === "unreadable" ? c.saved.unreadable : c.saved.pdfFailed });
  }

  async function remove(id: string) {
    setBusy({ id, action: "delete" });
    setRowError(null);
    const res = await accountCall(`/api/summaries/${id}`, { method: "DELETE" });
    setBusy(null);
    setConfirming(null);
    if (!res.ok) return setRowError({ id, text: c.saved.deleteFailed });
    setList((l) => l && { ...l, summaries: l.summaries.filter((s) => s.id !== id) });
  }

  const languageName = (code: string) => {
    const l = languages[code];
    return !l ? code : l.nativeName === l.englishName ? l.englishName : `${l.englishName} (${l.nativeName})`;
  };
  const journey = (flow: SummaryMeta["flow"]) => (flow === "prepare" ? messages.common.meta.prepareTitle : messages.common.meta.understandTitle);

  return (
    <section className={styles.section} aria-labelledby="saved-heading" aria-busy={list === null && !failed}>
      <h2 id="saved-heading" className={styles.heading}>
        {c.saved.heading}
      </h2>
      {list && !list.saving && <Banner tone="info">{c.saved.off}</Banner>}
      {failed ? (
        <div className={styles.card}>
          <p role="alert">{c.saved.loadFailed}</p>
          <Button variant="tertiary" onClick={retry}>
            {c.saved.retry}
          </Button>
        </div>
      ) : list === null ? (
        <p className={styles.muted}>{c.saved.loading}</p>
      ) : list.summaries.length === 0 ? (
        <p className={`${styles.card} ${styles.muted}`}>{c.saved.empty}</p>
      ) : (
        <ul className={styles.savedList}>
          {list.summaries.map((s) => (
            <li key={s.id} className={styles.card}>
              <div className={styles.savedMeta}>
                <h3 className={styles.savedTitle}>{journey(s.flow)}</h3>
                <p className={styles.muted}>{when(s.createdAt, language)}</p>
                {s.forWhom !== "not_asked" && <p>{format(c.saved.forWhom, { who: messages.prepare.who.options[s.forWhom] })}</p>}
                <p>{format(c.saved.language, { language: languageName(s.languageOutput) })}</p>
              </div>
              {confirming === s.id ? (
                <div className={styles.confirm} role="group" aria-labelledby={`confirm-${s.id}`}>
                  <p id={`confirm-${s.id}`}>{c.saved.deleteConfirm}</p>
                  <div className={styles.actions}>
                    <Button variant="tertiary" onClick={() => setConfirming(null)}>
                      {c.saved.cancel}
                    </Button>
                    <Button variant="primary" onClick={() => void remove(s.id)} loading={busy?.id === s.id && busy.action === "delete"} loadingLabel={c.saved.deleting}>
                      {c.saved.deleteYes}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={styles.actions}>
                  <Link href={`/account/saved/${s.id}`} className={styles.textLink}>
                    {c.saved.open}
                  </Link>
                  <Button variant="link" onClick={() => void pdf(s.id)} loading={busy?.id === s.id && busy.action === "pdf"} loadingLabel={c.saved.pdfMaking}>
                    {c.saved.pdf}
                  </Button>
                  <Button variant="link" onClick={() => setConfirming(s.id)}>
                    {c.saved.delete}
                  </Button>
                </div>
              )}
              {rowError?.id === s.id && (
                <p role="alert" className={styles.error}>
                  {rowError.text}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
