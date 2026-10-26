import { describe, expect, it } from "vitest";
import { redact } from "@/lib/safety/redact";

describe("redact (PRD 10.4)", () => {
  it.each([
    ["My NHS number is 943 476 5919", "My NHS number is [NHS-NUMBER]"],
    ["NHS no: 9434765919.", "NHS no: [NHS-NUMBER]."],
    ["ref 943-476-5919 thanks", "ref [NHS-NUMBER] thanks"],
  ])("NHS number: %s", (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it.each([
    ["call me on 07700 900123 please", "call me on [PHONE] please"],
    ["mobile 07700900123", "mobile [PHONE]"],
    ["text +44 7700 900123", "text [PHONE]"],
    ["+447700900123", "[PHONE]"],
    ["office (020) 7946 0958", "office [PHONE]"],
    ["landline 0161 496 0000", "landline [PHONE]"],
    ["+44 (0)20 7946 0958", "[PHONE]"],
    ["0044 20 7946 0958", "[PHONE]"],
    ["0113-496-0000", "[PHONE]"],
  ])("phone: %s", (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it.each([
    ["email jane.doe+nhs@example.co.uk now", "email [EMAIL] now"],
    ["J_Smith@mail.example.com", "[EMAIL]"],
  ])("email: %s", (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it.each([
    ["I live at SW1A 1AA", "I live at [POSTCODE]"],
    ["postcode m1 1ae.", "postcode [POSTCODE]."],
    ["B33 8TH", "[POSTCODE]"],
    ["CR2 6XH, Croydon", "[POSTCODE], Croydon"],
    ["DN551PT", "[POSTCODE]"],
    ["EC1A 1BB", "[POSTCODE]"],
  ])("postcode: %s", (input, expected) => {
    expect(redact(input)).toBe(expected);
  });

  it.each([
    "Call 999 now",
    "Call NHS 111 or Samaritans on 116 123",
    "Samaritans 116123",
    "Take 500mg twice a day",
    "Amoxicillin 250 mg three times a day for 7 days",
    "Appointment on 12/10/2026 at 09:30",
    "Review on 01-02-2026",
    "Take 2 x 5ml spoonfuls",
    "Vitamin B12 3mg daily",
    "I'm 58 and have had this for 3 weeks",
    "Blood pressure 140/90, pulse 72",
    "Weight 72.5kg, height 165cm",
    "Paracetamol 1g up to 4 times in 24 hours",
    "2026-10-12",
  ])("leaves alone: %s", (input) => {
    expect(redact(input)).toBe(input);
  });

  it("redacts several identifiers in one text", () => {
    expect(redact("Ring 07700 900123 or email a@b.com, NHS 943 476 5919, LS1 4AP")).toBe(
      "Ring [PHONE] or email [EMAIL], NHS [NHS-NUMBER], [POSTCODE]",
    );
  });
});
