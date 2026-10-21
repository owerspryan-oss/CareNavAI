import type { PostAppointmentResult, PreAppointmentResult } from "@/lib/ai/schemas";

export type PdfBody =
  | { flow: "prepare"; english: PreAppointmentResult; user: PreAppointmentResult | null }
  | { flow: "understand"; english: PostAppointmentResult; user: PostAppointmentResult | null };

/**
 * Ask the server to render the plain result as a PDF (FR-10) and hand it to the browser as a download.
 * The body is the result exactly as /api/summary or /api/explain returned it: never a restyled version.
 */
export async function downloadPdf(body: PdfBody, timeoutMs = 45_000): Promise<boolean> {
  try {
    const res = await fetch("/api/pdf", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok || res.headers.get("content-type") !== "application/pdf") return false;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "carenav-ai.pdf";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return true;
  } catch {
    return false;
  }
}
