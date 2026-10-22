"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PreAppointmentResult } from "@/lib/ai/schemas";
import type { SummaryResult } from "@/lib/client/prepare";
import { urgentMessageFor, type UrgentContent } from "@/lib/safety/urgent-content";
import {
  detectedLanguageName,
  highlightSegments,
  medicineLine,
  medicineTerms,
  safeHref,
  userTabLabel,
  versionDir,
  type LanguageNames,
} from "@/lib/result/view";
import { UrgentBanner } from "@/components/safety/UrgentBanner";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { CardDeck } from "@/components/ui/CardDeck";
import { AccountPrompt } from "./AccountPrompt";
import { FeedbackPrompt } from "./FeedbackPrompt";
import { SavePdfButton } from "./SavePdfButton";
import { useResultLayout } from "./useResultLayout";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TopBar } from "@/components/ui/TopBar";
import {
  BagIcon,
  ChatIcon,
  ChevronDownIcon,
  ClockIcon,
  HeartIcon,
  PersonIcon,
  PillIcon,
  QuestionIcon,
  RepeatIcon,
} from "@/components/ui/icons";
import { useUiLang } from "@/components/i18n/UiProvider";
import { useResultCopy, type ResultCopy } from "./copy";
import styles from "./ResultView.module.css";

export type OwnWordsSection =
  | "forWhom"
  | "mainConcern"
  | "duration"
  | "frequency"
  | "changes"
  | "medicines"
  | "previousSupport"
  | "worries";

/** The user's original words per section (AC-01.5), shown verbatim beside the result. */
export interface OwnWords {
  sections: Record<OwnWordsSection, string[]>;
  followUps: { question: string; answer: string | null }[];
}

export interface ResultViewProps {
  result: SummaryResult;
  ownWords: OwnWords;
  /** Static urgent content (server-built) for the persistent banner (v0.3 A2). Never model text. */
  urgentContent: UrgentContent;
  languages: LanguageNames;
  /** "Not quite" and the back chevron: return to review with every answer kept (AC-03.5). */
  onNotQuite: () => void;
  /**
   * A saved summary reopened from the account page (FR-14): the back chevron returns there, and the
   * match question, own words, feedback and account cards are left out.
   */
  readOnly?: boolean;
}

type Tab = "user" | "english";

/** Model text, rendered as React text only, with medicine names and doses highlighted. */
function Hl({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlightSegments(text, terms).map((s, i) =>
        s.mark ? (
          <mark key={i} className={styles.hl}>
            {s.text}
          </mark>
        ) : (
          s.text
        ),
      )}
    </>
  );
}

function OwnWordsQuote({ words }: { words: string[] }) {
  const c = useResultCopy();
  const ui = useUiLang();
  if (words.length === 0) return null;
  return (
    <figure className={styles.quote}>
      <figcaption className={styles.quoteHeading} {...ui}>
        {c.ownWordsHeading}
      </figcaption>
      {/* Exactly as the user typed it, in their language: no lang/dir override from the result. */}
      <blockquote className={styles.quoteText} dir="auto">
        {words.map((w, i) => (
          <p key={i}>{w}</p>
        ))}
      </blockquote>
    </figure>
  );
}

function Row({
  icon,
  tint = "teal",
  heading,
  own,
  children,
}: {
  icon: ReactNode;
  tint?: "teal" | "coral";
  heading: string;
  own?: string[];
  children: ReactNode;
}) {
  const ui = useUiLang();
  return (
    <section className={styles.row} aria-label={heading}>
      <span className={styles.badge} data-tint={tint} aria-hidden="true">
        {icon}
      </span>
      <div className={styles.rowBody}>
        <h2 className={styles.rowHeading} {...ui}>
          {heading}
        </h2>
        <div className={styles.rowContent}>{children}</div>
        {own && <OwnWordsQuote words={own} />}
      </div>
    </section>
  );
}

function List({ items, terms, ordered }: { items: string[]; terms: string[]; ordered?: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={styles.list}>
      {items.map((item, i) => (
        <li key={i}>
          <Hl text={item} terms={terms} />
        </li>
      ))}
    </Tag>
  );
}

type SummaryRow = { id: string; heading: string; row: ReactNode };

/**
 * The summary sections that have something in them, in order, so the same rows can render as a list
 * or a card deck. Sections the person didn't fill are not shown as empty rows: their names are listed
 * once under "Not mentioned" instead (AC-01.1, without a wall of "You didn't mention this").
 */
function summaryRows(v: PreAppointmentResult, own: OwnWords["sections"] | null, c: ResultCopy): { rows: SummaryRow[]; empty: string[] } {
  const terms = medicineTerms(v);
  const m = v.medicationAndSupport;
  const ownFor = (k: OwnWordsSection) => (own ? own[k] : undefined);
  const text = (t: string) => (t.trim() ? <p><Hl text={t} terms={terms} /></p> : null);
  const list = (items: string[], ordered = false) => (items.length ? <List items={items} terms={terms} ordered={ordered} /> : null);
  const sections: [string, string, ReactNode, ReactNode, OwnWordsSection | null, "teal" | "coral"][] = [
    ["forWhom", c.sections.forWhom, <PersonIcon key="i" />, text(v.forWhom.label), "forWhom", "teal"],
    ["mainConcern", c.sections.mainConcern, <ChatIcon key="i" />, text(v.mainConcern), "mainConcern", "teal"],
    ["duration", c.sections.duration, <ClockIcon key="i" />, v.duration.stated ? text(v.duration.text) : null, "duration", "teal"],
    ["frequency", c.sections.frequency, <RepeatIcon key="i" />, text(v.frequencyAndPattern), "frequency", "teal"],
    ["changes", c.sections.changes, <RepeatIcon key="i" />, list(v.changesAndTriggers), "changes", "teal"],
    ["medicines", c.sections.medicines, <PillIcon key="i" />, m.provided ? list(m.medicines.map(medicineLine)) : null, "medicines", "coral"],
    ["previousSupport", c.sections.previousSupport, <HeartIcon key="i" />, list(m.previousSupport), "previousSupport", "coral"],
    ["worries", c.sections.worries, <HeartIcon key="i" />, list(v.worriesAndBarriers), "worries", "coral"],
    ["questions", c.sections.questions, <QuestionIcon key="i" />, list(v.questionsToAsk, true), null, "teal"],
    ["whatToBring", c.sections.whatToBring, <BagIcon key="i" />, list(v.whatToBring), null, "teal"],
  ];
  const rows: SummaryRow[] = [];
  const empty: string[] = [];
  for (const [id, heading, icon, content, ownKey, tint] of sections) {
    if (content === null) {
      // Suggested questions and things to bring are ours, not the person's: an empty one is just left out.
      if (ownKey) empty.push(heading);
      continue;
    }
    rows.push({
      id,
      heading,
      row: (
        <Row key={id} icon={icon} tint={tint} heading={heading} own={ownKey ? ownFor(ownKey) : undefined}>
          {content}
        </Row>
      ),
    });
  }
  return { rows, empty };
}

/**
 * Journey 1 result (FR-01, FR-03): user version and English master side by side via a segmented
 * control, the user's own words beside each section, and the static routes and disclaimer.
 */
export function ResultView({ result, ownWords, urgentContent, languages, onNotQuite, readOnly = false }: ResultViewProps) {
  const c = useResultCopy();
  const ui = useUiLang();
  const { english, user } = result;
  const [tab, setTab] = useState<Tab>(user ? "user" : "english");
  const [matched, setMatched] = useState(false);
  const [layout, setLayout] = useResultLayout();
  const [showOwn, setShowOwn] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const shown = tab === "user" && user ? user : english;
  const isUser = shown === user;
  const urgentLevel = english.meta.urgentAcknowledged;
  const detected = detectedLanguageName(english.meta.detectedLanguage, languages);
  const dir = versionDir(shown.meta, languages);
  const lang = shown.meta.outputMode === "translation" ? shown.meta.outputLanguage : "en";
  const terms = medicineTerms(shown);
  const answeredFollowUps = ownWords.followUps;
  const { rows, empty } = summaryRows(shown, showOwn ? ownWords.sections : null, c);

  return (
    <div className={styles.page}>
      <TopBar backLabel={readOnly ? c.savedView.back : c.actions.backToAnswers} onBack={onNotQuite} />
      <main className={styles.main}>
        {urgentLevel && (
          <UrgentBanner
            level={urgentLevel}
            content={urgentMessageFor(urgentContent, urgentLevel)}
            showDraftLabel={urgentContent.showDraftLabel}
            draftLabel={urgentContent.draftLabel}
            draftLabelLanguage={urgentContent.draftLabelLanguage}
            draftLabelDir={urgentContent.draftLabelDir}
            lang={urgentContent.language}
            dir={urgentContent.dir}
          />
        )}

        {user && (
          <SegmentedControl<Tab>
            label={c.tabsLabel}
            idPrefix="result"
            value={tab}
            onChange={setTab}
            options={[
              { value: "user", label: userTabLabel(user.meta, languages, c.simpleEnglish) },
              { value: "english", label: c.forDoctor },
            ]}
          />
        )}

        {/* One caution banner: the draft notice, plus the confidence or English-only notice when they apply. */}
        <Banner tone="caution">
          <span className={styles.bannerLine}>{c.draftNotice}</span>
          {isUser && shown.meta.confidenceNotice && <span className={styles.bannerLine}>{c.confidenceNotice}</span>}
          {!user && <span className={styles.bannerLine}>{c.englishOnlyNotice}</span>}
        </Banner>

        <div className={styles.intro}>
          <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
            {c.title}
          </h1>
          {detected && <p className={styles.caption}>{c.weReadThisAs(detected)}</p>}
        </div>

        {/* One quiet row of view options instead of controls scattered through the page. */}
        <div className={styles.viewOptions}>
          {!readOnly && (
            <Button variant="link" onClick={() => setShowOwn(!showOwn)} aria-pressed={showOwn}>
              {showOwn ? c.hideOwnWords : c.showOwnWords}
            </Button>
          )}
          {isUser && (
            <Button variant="link" onClick={() => setLayout(layout === "deck" ? "list" : "deck")}>
              {layout === "deck" ? c.layout.toList : c.layout.toDeck}
            </Button>
          )}
        </div>

        <div
          key={tab}
          id="result-panel"
          role={user ? "tabpanel" : undefined}
          aria-labelledby={user ? `result-tab-${tab}` : undefined}
          className={styles.panel}
          dir={dir}
          lang={lang}
        >
          {/* The deck is only for the person's own version; the doctor's English version is always a list. */}
          {isUser && layout === "deck" ? (
            <CardDeck
              label={c.layout.deckLabel}
              labels={c.layout}
              cards={rows.map(({ id, heading, row }) => ({ id, title: heading, titleInBody: true, body: row }))}
            />
          ) : (
            <div className={styles.card}>{rows.map((r) => r.row)}</div>
          )}

          {showOwn && answeredFollowUps.length > 0 && (
            <section className={styles.block} aria-labelledby="result-followups">
              <h2 id="result-followups" className={styles.blockHeading} {...ui}>
                {c.sections.followUps}
              </h2>
              {answeredFollowUps.map((f, i) => (
                <figure key={i} className={styles.quote}>
                  <figcaption className={styles.quoteHeading} dir="auto">
                    {f.question}
                  </figcaption>
                  {f.answer ? (
                    <blockquote className={styles.quoteText} dir="auto">
                      <p>{f.answer}</p>
                    </blockquote>
                  ) : (
                    <p className={styles.notMentioned} {...ui}>
                      {c.skippedQuestion}
                    </p>
                  )}
                </figure>
              ))}
            </section>
          )}

          <section className={styles.block} aria-labelledby="result-not-mentioned">
            <h2 id="result-not-mentioned" className={styles.blockHeading} {...ui}>
              {c.sections.notMentioned}
            </h2>
            <div className={styles.plainCard}>
              {empty.length > 0 && <p {...ui}>{c.youDidntMention(empty)}</p>}
              {shown.notMentioned.length > 0 && <List items={shown.notMentioned} terms={terms} />}
              {empty.length === 0 && shown.notMentioned.length === 0 && <p {...ui}>{c.nothingMissing}</p>}
            </div>
          </section>
        </div>

        {!readOnly && (
          <>
            <section className={styles.matchCard} aria-labelledby="result-match">
              <h2 id="result-match" className={styles.matchQuestion}>
                {c.match.question}
              </h2>
              {matched ? (
                <p role="status" className={styles.matchThanks}>
                  {c.match.thanks}
                </p>
              ) : (
                <div className={styles.matchActions}>
                  <Button variant="tertiary" onClick={onNotQuite}>
                    {c.match.notQuite}
                  </Button>
                  <Button variant="secondary" onClick={() => setMatched(true)}>
                    {c.match.yes}
                  </Button>
                </div>
              )}
            </section>

            <FeedbackPrompt flow="prepare" language={(user ?? english).meta.outputLanguage} />
            <AccountPrompt saved={result.saved} />
          </>
        )}

        <div className={styles.moreInfo} dir={dir} lang={lang}>
          <details className={styles.moreItem}>
            <summary className={styles.moreSummary} {...ui}>
              {c.sections.serviceRoutes}
              <ChevronDownIcon className={styles.moreChevron} />
            </summary>
            <ul className={styles.routes}>
              {shown.serviceRoutes.map((r) => (
                <li key={r.id} className={styles.route}>
                  <p className={styles.routeName}>{r.name}</p>
                  <p className={styles.routeText}>{r.description}</p>
                  {r.contacts.length > 0 && (
                    <div className={styles.routeContacts}>
                      {r.contacts.map((ct) => {
                        const href = safeHref(ct.href);
                        return href ? (
                          <a key={ct.href} href={href} className={styles.routeLink}>
                            {ct.label}
                          </a>
                        ) : null;
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </details>
          <details className={styles.moreItem}>
            <summary className={styles.moreSummary} {...ui}>
              {c.sections.disclaimer}
              <ChevronDownIcon className={styles.moreChevron} />
            </summary>
            <div className={styles.disclaimer}>
              {shown.disclaimer.map((d, i) => (
                <p key={i}>{d}</p>
              ))}
            </div>
          </details>
        </div>
      </main>

      <footer className={styles.footer}>
        <SavePdfButton body={{ flow: "prepare", english, user }} />
      </footer>
    </div>
  );
}
