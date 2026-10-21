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
    "We couldn't make a version in your language this time, so this is the English version. It is still safe to show your doctor.",

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
