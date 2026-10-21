import type { ExtractProblem } from "@/lib/client/understand";

/*
 * Journey 2 interface copy (English). Static, never model text. Kept in one module so epic-language
 * can move it into the reviewed locale files (D13 / ADR-012).
 * PRODUCT OWNER TO REVIEW: all of it, and especially the photo privacy advice (AC-08.2), the
 * retake copy (AC-08.4) and the "From your letter" card on the urgent screen (AC-05.9).
 */

export const understandCopy = {
  choose: {
    title: "What were you told?",
    lead: "Add a letter, prescription or note from your appointment. We'll explain it in plainer words.",
    photo: "Take a photo of a letter or prescription",
    photoHint: "We'll read the words for you to check.",
    type: "Type or paste it",
    typeHint: "Any language is fine.",
    noticeHeading: "Before you start",
  },

  /** AC-08.2: shown before the camera opens. */
  photoAdvice: {
    title: "Before you take the photo",
    lead: "Please cover or fold over these, so they are not in the photo:",
    items: ["Your name", "Your address", "Your NHS number"],
    afterItems: "Lay the letter flat in good light, and fit the whole page in the photo.",
    privacy: "Your photo stays on this device. We never save it.",
    openCamera: "Open camera",
    choosePhoto: "Choose a photo instead",
  },

  reading: {
    title: "Reading your letter",
    lead: "This can take up to a minute. Please keep this page open.",
  },

  /** AC-08.4 and upload errors. Static copy only, never server text. */
  photoProblems: {
    retake: {
      title: "We couldn't read that clearly",
      body: "Please take the photo again. Lay the letter flat, use good light, and hold the phone steady.",
    },
    unreadable: {
      title: "We couldn't open that photo",
      body: "Please try a different photo, or type the words instead.",
    },
    invalid: {
      title: "We couldn't open that photo",
      body: "Please try a different photo, or type the words instead.",
    },
    too_large: {
      title: "That photo is too big",
      body: "Please take the photo again, or type the words instead.",
    },
    rate_limited: {
      title: "Please wait a moment",
      body: "You've sent a lot in a short time. Please wait a minute, then try again.",
    },
    busy: {
      title: "We're busy right now",
      body: "Too many people are using CareNav AI at the moment. Please try again in a few minutes.",
    },
    failed: {
      title: "Something went wrong",
      body: "We couldn't read your photo this time. Please try again, or type the words instead.",
    },
  } satisfies Record<ExtractProblem | "unreadable", { title: string; body: string }>,
  retake: "Take the photo again",
  typeInstead: "Type it instead",

  confirm: {
    photoTitle: "Check the words from your photo",
    photoLead: "We may have misread something. Fix anything that's wrong before we explain it.",
    typedTitle: "What does your letter say?",
    typedLead: "Type or paste the words from your letter, prescription or appointment.",
    label: "The words from your letter",
    placeholder: "Type or paste here.",
    found: "Medicines, doses and dates we spotted:",
    checkThese: "Check these against your letter or the label.",
    confirm: "This is right, explain it",
    checking: "Checking",
    required: "Please type or paste some words first.",
    retakePhoto: "Retake photo",
  },

  photo: {
    alt: "Your photo of the letter",
    caption: "Your photo. It stays on this device and is gone when you leave.",
    larger: "Show larger",
    smaller: "Show smaller",
  },

  /** AC-05.9: the person's own confirmed letter text, shown on the urgent screen. Source text, not AI text. */
  fromLetter: {
    heading: "From your letter",
    showAll: "Show all of it",
    showLess: "Show less",
  },

  followUpsLead: "These help us explain your letter clearly. You can skip any of them.",

  status: {
    makingTitle: "Explaining your letter",
    makingLead: "This can take up to a minute. Please keep this page open.",
    errors: {
      too_long: {
        title: "Your letter is too long",
        body: "Please go back and shorten it to the part you want explained, then try again.",
      },
      busy: {
        title: "We're busy right now",
        body: "Too many people are using CareNav AI at the moment. Please try again in a few minutes.",
      },
      failed: {
        title: "Something went wrong",
        body: "We couldn't explain your letter this time. Your words are still here. Please try again.",
      },
    },
    tryAgain: "Try again",
    backToAnswers: "Back to the words",
  },

  actions: {
    back: "Back",
    backToStart: "Back to start",
    continue: "Continue",
  },

  errors: {
    tooLong: (max: number, length: number) =>
      `This is ${(length - max).toLocaleString("en-GB")} characters too long. Please shorten it to ${max.toLocaleString("en-GB")} characters or fewer.`,
  },
} as const;
