/*
 * PDF and clinician-form copy (English, FR-10, FR-16). Static, never model text.
 * Kept in one module so epic-language can move it into reviewed locale files.
 * Product owner to review all of it before it is treated as final.
 */

export const pdfCopy = {
  brand: "CareNav AI",
  madeOn: (date: string) => `Made with CareNav AI on ${date}`,
  pageOf: "Page",

  prepare: {
    clinicianTitle: "Appointment summary",
    clinicianLead: "For the doctor, nurse or other health professional. Written from what the patient told CareNav AI, in their own time before the appointment.",
    userTitle: "Your summary",
    sections: {
      forWhom: "Who it's for",
      mainConcern: "Main concern",
      duration: "How long",
      frequency: "How often",
      changes: "Changes and patterns",
      medicines: "Medicines",
      previousSupport: "Help so far",
      worries: "Worries",
      questions: "Questions to ask",
      whatToBring: "What to bring",
      notMentioned: "Not mentioned",
      serviceRoutes: "Where to get help",
    },
    durationNotStated: "Not stated",
    noMedicines: "No medicines mentioned.",
  },

  understand: {
    userTitle: "What your letter means",
    userLead: "A plain explanation of your letter, for you to keep. Each point shows the words from your letter it comes from.",
    englishTitle: "In English",
    englishLead: "The same explanation in English, to show a family member, a pharmacist or anyone helping you.",
    sections: {
      whatYouWereTold: "What you were told",
      whatItMeans: "What the words mean",
      nextSteps: "Next steps",
      medicines: "Medicines",
      unclearOrMissing: "Unclear or missing",
    },
    fromSource: "From the letter",
    byWhen: "When",
    dose: "Dose",
    frequency: "How often",
    duration: "How long",
    instructions: "Instructions",
    checkMedicines: "Check these against your letter or the label.",
    whoToAsk: {
      clinician: "Ask the person who wrote it",
      pharmacist: "Ask a pharmacist",
      gp_surgery: "Ask your GP surgery",
    },
    ungroundedTitle: "We couldn't find this in your letter",
    ungroundedLead: "These points could not be matched to the words in the letter, so they are not shown as fact. Please check them with the person who wrote it.",
  },

  relationship: { self: "Self", parent: "Parent", carer: "Carer", other: "Someone else" },
  ageBand: { under_1: "Under 1", "1_to_4": "1 to 4", "5_to_11": "5 to 11", "12_to_17": "12 to 17", adult: "Adult" },

  confidenceNotice: "Please double-check this with someone who speaks your language.",
  aboutThis: "About this document",

  qr: {
    title: "For clinicians: was this useful?",
    body: "Scan the code or type the link to tell us, in under a minute.",
    privacy: "The link holds a random reference only. It carries no patient information.",
  },

  form: {
    title: "Was this CareNav AI document useful?",
    lead: "Thank you for looking at it. Your answers help us decide whether to run a pilot. This form is anonymous.",
    useful: {
      legend: "Was the summary useful?",
      options: { yes: "Yes", partly: "Partly", no: "No" },
    },
    missing: {
      legend: "Was anything missing or misleading?",
      options: { none: "No", missing: "Something was missing", misleading: "Something was misleading", both: "Both" },
    },
    comment: {
      label: "Anything else? (optional)",
      warning: "Please do not enter any patient details: no names, dates of birth, NHS numbers or clinical details.",
      counter: (max: number) => `Up to ${max} characters.`,
    },
    submit: "Send feedback",
    sentTitle: "Thank you",
    sentBody: "Your feedback has been saved. You can close this page.",
    invalid: "Please answer both questions. Comments can be up to 500 characters.",
    full: "We already have feedback for this document. Thank you.",
  },
} as const;
