/*
 * Result view interface copy (English). Static, never model text. Kept in one module so
 * epic-language can move it into reviewed locale files. Product owner to review all of it.
 */

export const resultCopy = {
  title: "Here's your summary",
  lead: "Check it says what you meant, then show it to your doctor or nurse.",
  draftNotice: "This is a draft to help you prepare. It is not medical advice.",
  weReadThisAs: (language: string) => `We read this as: ${language}`,

  tabsLabel: "Choose a version",
  simpleEnglish: "Simple English",
  forDoctor: "English (for your doctor)",

  /** AC-03.4. Shown on the user version when the derive step flagged low confidence. */
  confidenceNotice: "Please double-check this with someone who speaks your language.",
  /** Shown when there is no user-language version (`user` is null). */
  englishOnlyNotice:
    "We couldn't make a reliable version in your language this time, so your summary is in English only. Nothing is missing from it, and you can show it to your doctor as it is.",

  sections: {
    forWhom: "Who it's for",
    mainConcern: "Main concern",
    duration: "How long",
    frequency: "How often",
    changes: "Changes and patterns",
    medicines: "Medicines",
    previousSupport: "Help so far",
    worries: "Worries",
    questions: "Questions you could ask",
    whatToBring: "What to bring",
    notMentioned: "Not mentioned",
    followUps: "Your extra answers",
    serviceRoutes: "Where to get help",
    disclaimer: "About this summary",
  },
  notMentionedLead: "Your doctor may ask about these.",
  didNotMention: "You didn't mention this.",

  showOwnWords: "What you told us",
  ownWordsHeading: "What you told us",
  skippedQuestion: "You skipped this question.",

  match: {
    question: "Does this match what you meant?",
    yes: "Yes",
    notQuite: "Not quite",
    thanks: "Thank you. You can show this to your doctor or nurse.",
  },

  actions: {
    backToAnswers: "Back to my answers",
    savePdf: "Save as PDF",
    feedback: "Give feedback",
    comingSoon: "Coming soon",
  },
} as const;

/*
 * Journey 2 result copy (FR-02, AC-02.5, AC-08.6). Static, never model text.
 * PRODUCT OWNER TO REVIEW: all of it, and in particular `notFound` (CLAUDE.md rule 7). That section
 * is not in the agreed mockups (DESIGN_SYSTEM.md §10): it is neutral on purpose, never styled as fact.
 */
export const explainCopy = {
  title: "Here's what your letter means",
  lead: "In plainer words. Check it against your letter, and ask if anything is unclear.",
  /** Mockup screen 3: "Draft — please check with a pharmacist or GP." */
  draftNotice: "This is a draft to help you understand. Please check it with a pharmacist or GP. It is not medical advice.",
  /** Shown when there is no user version (`user` is null). */
  englishOnlyNotice:
    "We couldn't make a reliable version in your language this time, so this explanation is in English only. Nothing is missing from it.",

  sections: {
    told: "What you were told",
    means: "What it means",
    steps: "Next steps",
    medicines: "Medicines",
    unclear: "Unclear or missing",
    disclaimer: "About this explanation",
  },
  empty: {
    told: "We couldn't pick out the main points. Please check the letter itself.",
    means: "There were no medical words to explain.",
    steps: "Your letter doesn't mention anything for you to do.",
    medicines: "Your letter doesn't mention any medicines.",
    unclear: "Nothing looked unclear or missing.",
  },

  byWhen: (when: string) => `When: ${when}`,
  medicine: {
    dose: "Dose",
    frequency: "How often",
    duration: "How long",
    instructions: "How to take it",
    notStated: "Not in your letter",
  },
  /** AC-02.5 */
  checkThese: "Check these against your letter or the label.",

  whoToAsk: {
    clinician: "Ask the person who wrote your letter",
    pharmacist: "Ask a pharmacist",
    gp_surgery: "Ask your GP surgery",
  },

  showSource: "Show source",
  fromLetter: "From your letter",

  /** CLAUDE.md rule 7: items whose quote is not in the letter. Never shown as fact. */
  notFound: {
    heading: "We couldn't find this in your letter",
    lead: "We left these out because we couldn't find them in the words you gave us. Don't rely on them. If they matter to you, ask the person who wrote your letter.",
  },

  languagePicker: {
    label: "Show me this in",
    defaultOption: "Simple English",
    updating: "Updating…",
    failed: "We couldn't make that version this time. You're still seeing the last one.",
  },

  actions: {
    backToWords: "Back to the words",
  },
} as const;
