"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { downloadPdf, type PdfBody } from "@/lib/client/pdf";
import { resultCopy as c } from "./copy";
import styles from "./ResultView.module.css";

/** Save as PDF (FR-10). Errors are a short static message; nothing is retried behind the user's back. */
export function SavePdfButton({ body }: { body: PdfBody }) {
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  return (
    <div className={styles.pdfAction}>
      <Button
        variant="tertiary"
        loading={state === "saving"}
        loadingLabel={c.actions.savingPdf}
        onClick={async () => {
          setState("saving");
          setState((await downloadPdf(body)) ? "idle" : "failed");
        }}
      >
        {c.actions.savePdf}
      </Button>
      <p className={styles.pdfStatus} role="status" aria-live="polite">
        {state === "failed" ? c.actions.pdfFailed : ""}
      </p>
    </div>
  );
}
