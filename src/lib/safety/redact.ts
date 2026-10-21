// Local identifier redaction (PRD 10.4, FR-05). Runs on every input before any
// gate layer or model call. Names cannot be removed reliably; the guest notice
// says so. Placeholders contain no digits so later number checks can't trip on them.

export const REDACTION_PLACEHOLDERS = {
  email: "[EMAIL]",
  phone: "[PHONE]",
  nhsNumber: "[NHS-NUMBER]",
  postcode: "[POSTCODE]",
} as const;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

// UK numbers: +44 / 0044 followed by 9-10 digits, or a leading 0 followed by 9-10
// digits, with optional single spaces, dashes or brackets between digits.
// 999, 111 and 116 123 have no leading 0 / +44, so they are never touched.
const PHONE = /(?<![\d+])(?:(?:\+|00)44[\s-]?(?:\(0\)[\s-]?)?|\(?0)(?:\d\)?[\s-]?){8,9}\d(?!\d)/g;

// NHS number: 10 digits, optionally grouped 3-3-4 by spaces or dashes. Run after
// PHONE so an 11-digit phone number is never half-matched.
const NHS_NUMBER = /(?<![\d+])\d{3}[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g;

// Full UK postcode (outward + inward). The inward letters exclude C I K M O V,
// so doses such as "B12 3mg" do not match.
const POSTCODE = /\b(?:GIR\s?0AA|[A-Z]{1,2}\d[A-Z\d]?\s?\d[ABD-HJLNP-UW-Z]{2})\b/gi;

export function redact(text: string): string {
  return text
    .replace(EMAIL, REDACTION_PLACEHOLDERS.email)
    .replace(PHONE, REDACTION_PLACEHOLDERS.phone)
    .replace(NHS_NUMBER, REDACTION_PLACEHOLDERS.nhsNumber)
    .replace(POSTCODE, REDACTION_PLACEHOLDERS.postcode);
}
