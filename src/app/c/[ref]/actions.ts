"use server";

import { redirect } from "next/navigation";
import { log } from "@/lib/log/logger";
import { clinicianFeedbackSchema, saveClinicianFeedback } from "@/lib/pdf/feedback";

/** POST from /c/[ref] (FR-16, AC-16.3). Stores the two answers and an optional short comment; no IP, no content in logs. */
export async function submitClinicianFeedback(ref: string, form: FormData): Promise<void> {
  const parsed = clinicianFeedbackSchema.safeParse({
    ref,
    useful: form.get("useful"),
    missingOrMisleading: form.get("missingOrMisleading"),
    comment: form.get("comment") ?? "",
  });
  const status = parsed.success ? saveClinicianFeedback(parsed.data) : "invalid";
  log.info({ route: "/c/[ref]", step: "clinician_feedback", status: status === "saved" ? 200 : 400 });
  if (status === "unknown_ref") redirect(`/c/${encodeURIComponent(ref)}`);
  redirect(`/c/${encodeURIComponent(ref)}?status=${status === "saved" ? "sent" : status}`);
}
