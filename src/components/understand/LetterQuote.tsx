"use client";

import { useState } from "react";
import { QuoteIcon } from "@/components/ui/icons";
import { understandCopy as c } from "./copy";
import styles from "./Understand.module.css";

/** Longer than this, the card starts clamped with a "Show all of it" toggle. */
const CLAMP_CHARS = 320;
const CLAMP_LINES = 7;

/**
 * AC-05.9: on the urgent screen for a letter, the person's own confirmed letter text, quoted in a card
 * clearly apart from the static urgent message. It is source text, never AI text (CLAUDE.md rule 3).
 */
export function LetterQuote({ text }: { text: string }) {
  const long = text.length > CLAMP_CHARS || text.split("\n").length > CLAMP_LINES;
  const [open, setOpen] = useState(!long);
  return (
    <figure className={styles.letterQuote} data-source="letter">
      <QuoteIcon className={styles.letterQuoteIcon} />
      <figcaption className={styles.letterQuoteHeading}>{c.fromLetter.heading}</figcaption>
      <blockquote id="letter-quote-text" className={styles.letterQuoteText} data-clamped={!open || undefined} dir="auto">
        {text}
      </blockquote>
      {long && (
        <button
          type="button"
          className={styles.letterQuoteToggle}
          aria-expanded={open}
          aria-controls="letter-quote-text"
          onClick={() => setOpen(!open)}
        >
          {open ? c.fromLetter.showLess : c.fromLetter.showAll}
        </button>
      )}
    </figure>
  );
}
