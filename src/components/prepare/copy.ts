import type { AgeBand } from "@/lib/ai/schemas";
import type { Pattern, Relationship, Started, StepId } from "@/lib/prepare/state";

/*
 * Journey 1 interface copy (English). Kept in one module so epic-language can move it into the
 * reviewed locale files (D13 / ADR-012) without hunting through components.
 * Plainest wording possible (AC-21.3). The draft notice is static disclaimer copy: product owner to review.
 */

export const prepareCopy = {
  draftNotice: "This is a draft to help you prepare. It is not medical advice.",
  stepLabel: (n: number, total: number) => `Step ${n} of ${total}`,

  steps: {
    who: {
      title: "Who is this appointment for?",
      lead: "We'll write your summary from the right point of view.",
    },
    concern: {
      title: "What would you like to talk to your doctor about?",
      lead: "Write it in your own words, in any language. There's no wrong way to say it.",
    },
    timing: {
      title: "How long and how often?",
      lead: "Pick the answers that fit best. “I'm not sure” is fine.",
    },
    changes: {
      title: "Have you noticed any changes or patterns?",
      lead: "For example, if it's worse at night, after food, or at certain times.",
    },
    medicines: {
      title: "Medicines and help so far",
      lead: "This step is optional. You can skip it.",
    },
    worries: {
      title: "Is anything worrying you, or making this hard to talk about?",
      lead: "This step is optional. You can skip it.",
    },
    review: {
      title: "Check your answers",
      lead: "You can change anything before we make your summary.",
    },
  } satisfies Record<StepId, { title: string; lead: string }>,

  who: {
    legend: "Choose one",
    options: {
      self: "Me",
      parent: "My child",
      carer: "Someone I look after",
      other: "Someone else",
    } satisfies Record<Relationship, string>,
    ageLegend: "How old is your child?",
    ageBands: {
      under_1: "Under 1",
      "1_to_4": "1 to 4",
      "5_to_11": "5 to 11",
      "12_to_17": "12 to 17",
      adult: "18 or over",
    } satisfies Record<AgeBand, string>,
    labelLabel: "Who are they to you? (optional)",
    labelHint: "For example: my mum, my neighbour.",
  },

  concern: {
    label: "Your main concern",
    placeholder: "Type here, in any language.",
  },

  timing: {
    startedLegend: "When did it start?",
    started: {
      today: "Today",
      days: "In the last few days",
      weeks: "1 to 4 weeks ago",
      months: "1 to 6 months ago",
      over_6_months: "More than 6 months ago",
      not_sure: "I'm not sure",
    } satisfies Record<Started, string>,
    patternLegend: "How often is it there?",
    pattern: {
      constant: "All the time",
      comes_and_goes: "It comes and goes",
      changing: "It's changing",
      not_sure: "I'm not sure",
    } satisfies Record<Pattern, string>,
    notesLabel: "Anything else about when it happens? (optional)",
  },

  changes: {
    label: "Changes or patterns you've noticed",
    placeholder: "Type here, in any language.",
    nonePattern: "I haven't noticed any pattern",
  },

  medicines: {
    medicinesLabel: "Medicines you take now",
    medicinesHint: "Include anything from a pharmacy or shop.",
    supportLabel: "Help you've already had",
    supportHint: "For example: a pharmacist, a GP visit or a hospital.",
  },

  worries: {
    label: "Your worries",
    placeholder: "Type here, in any language.",
  },

  review: {
    change: "Change",
    followUpsHeading: "Your extra answers",
    skipped: "You skipped this",
    noPattern: "I haven't noticed any pattern",
    whoHeading: "Who it's for",
    concernHeading: "Main concern",
    timingHeading: "How long and how often",
    changesHeading: "Changes and patterns",
    medicinesHeading: "Medicines",
    supportHeading: "Help so far",
    worriesHeading: "Worries",
    startedPrefix: "Started:",
    patternPrefix: "How often:",
    childAge: (band: string) => `My child, aged ${band}`,
    getSummary: "Get my summary",
  },

  /** Step 7, dynamic follow-ups (FR-22). The questions themselves come from the server. */
  followUps: {
    title: "A few quick questions",
    lead: "These help your doctor understand you. You can skip any of them.",
    placeholder: "Type here, in any language.",
    skip: "Skip",
    skipped: "Skipped",
    undoSkip: "Answer this",
    continue: "Continue",
  },

  /** Loading and error states for the summary call. Static copy only, never server text. */
  summaryStatus: {
    makingTitle: "Making your summary",
    makingLead: "This can take up to a minute. Please keep this page open.",
    errors: {
      too_long: {
        title: "Some of your answers are too long",
        body: "Please go back and make your answers a little shorter, then try again.",
      },
      busy: {
        title: "We're busy right now",
        body: "Too many people are using CareNav AI at the moment. Please try again in a few minutes.",
      },
      failed: {
        title: "Something went wrong",
        body: "We couldn't make your summary this time. Your answers are still here. Please try again.",
      },
    },
    tryAgain: "Try again",
    backToAnswers: "Back to my answers",
  },

  actions: {
    back: "Back",
    backToStart: "Back to start",
    next: "Next",
    skip: "Skip this step",
    saveAndReview: "Save and review",
    checking: "Checking your answer",
  },

  errors: {
    chooseOne: "Please choose one.",
    chooseAge: "Please choose an age.",
    required: "Please write a few words. Any language is fine.",
    changesRequired: "Please write what you've noticed, or tick “I haven't noticed any pattern”.",
    tooLong: (max: number, length: number) =>
      `This is ${(length - max).toLocaleString("en-GB")} characters too long. Please shorten it to ${max.toLocaleString("en-GB")} characters or fewer.`,
  },
} as const;
