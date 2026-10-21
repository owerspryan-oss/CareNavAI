import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pdfCopy } from "@/lib/pdf/copy";
import { COMMENT_MAX, refExists } from "@/lib/pdf/feedback";
import { submitClinicianFeedback } from "./actions";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Clinician feedback · CareNav AI",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const copy = pdfCopy.form;

/** Clinician feedback form reached from the PDF's QR code (FR-16, AC-16.3, AC-10.3). */
export default async function ClinicianFeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { ref } = await params;
  if (!refExists(ref)) notFound();
  const { status } = await searchParams;

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <p className={styles.wordmark}>
          CareNav <span>AI</span>
        </p>
      </header>

      {status === "sent" || status === "full" ? (
        <section className={styles.card} aria-live="polite">
          <h1 className={styles.title}>{copy.sentTitle}</h1>
          <p>{status === "sent" ? copy.sentBody : copy.full}</p>
        </section>
      ) : (
        <form className={styles.card} action={submitClinicianFeedback.bind(null, ref)}>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.lead}>{copy.lead}</p>
          {status === "invalid" && (
            <p className={styles.error} role="alert">
              {copy.invalid}
            </p>
          )}

          <fieldset className={styles.group}>
            <legend className={styles.legend}>{copy.useful.legend}</legend>
            <div className={styles.options}>
              {Object.entries(copy.useful.options).map(([value, label]) => (
                <label key={value} className={styles.option}>
                  <input type="radio" name="useful" value={value} required />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.group}>
            <legend className={styles.legend}>{copy.missing.legend}</legend>
            <div className={styles.options}>
              {Object.entries(copy.missing.options).map(([value, label]) => (
                <label key={value} className={styles.option}>
                  <input type="radio" name="missingOrMisleading" value={value} required />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className={styles.group}>
            <label htmlFor="comment" className={styles.legend}>
              {copy.comment.label}
            </label>
            <p id="comment-warning" className={styles.warning}>
              {copy.comment.warning}
            </p>
            <textarea
              id="comment"
              name="comment"
              rows={4}
              maxLength={COMMENT_MAX}
              aria-describedby="comment-warning comment-limit"
              className={styles.textarea}
              autoComplete="off"
            />
            <p id="comment-limit" className={styles.caption}>
              {copy.comment.counter(COMMENT_MAX)}
            </p>
          </div>

          <button type="submit" className={styles.submit}>
            {copy.submit}
          </button>
        </form>
      )}
    </main>
  );
}
