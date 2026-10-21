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
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TopBar } from "@/components/ui/TopBar";
import {
  BagIcon,
  ChatIcon,
  ChevronDownIcon,
  ClockIcon,
  DocumentIcon,
  HeartIcon,
  PersonIcon,
  PillIcon,
  QuestionIcon,
  QuoteIcon,
  RepeatIcon,
} from "@/components/ui/icons";
import { resultCopy as c } from "./copy";
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

function OwnWordsDisclosure({ words }: { words: string[] }) {
  if (words.length === 0) return null;
  return (
    <details className={styles.disclosure}>
      <summary className={styles.chip}>
        <DocumentIcon className={styles.chipIcon} />
        {c.showOwnWords}
        <ChevronDownIcon className={styles.chipChevron} />
      </summary>
      <figure className={styles.quote}>
        <QuoteIcon className={styles.quoteIcon} />
        <figcaption className={styles.quoteHeading}>{c.ownWordsHeading}</figcaption>
        {/* Exactly as the user typed it, in their language: no lang/dir override from the result. */}
        <blockquote className={styles.quoteText} dir="auto">
          {words.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </blockquote>
      </figure>
    </details>
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
  return (
    <section className={styles.row} aria-label={heading}>
      <span className={styles.badge} data-tint={tint} aria-hidden="true">
        {icon}
      </span>
      <div className={styles.rowBody}>
        <h2 className={styles.rowHeading}>{heading}</h2>
        <div className={styles.rowContent}>{children}</div>
        {own && <OwnWordsDisclosure words={own} />}
      </div>
    </section>
  );
}

function List({ items, terms, ordered }: { items: string[]; terms: string[]; ordered?: boolean }) {
  if (items.length === 0) return <p className={styles.notMentioned}>{c.didNotMention}</p>;
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

function Text({ text, terms }: { text: string; terms: string[] }) {
  return text.trim() ? (
    <p>
      <Hl text={text} terms={terms} />
    </p>
  ) : (
    <p className={styles.notMentioned}>{c.didNotMention}</p>
  );
}

function Summary({ v, own }: { v: PreAppointmentResult; own: OwnWords["sections"] }) {
  const terms = medicineTerms(v);
  const m = v.medicationAndSupport;
  return (
    <div className={styles.card}>
      <Row icon={<PersonIcon />} heading={c.sections.forWhom} own={own.forWhom}>
        <Text text={v.forWhom.label} terms={terms} />
      </Row>
      <Row icon={<ChatIcon />} heading={c.sections.mainConcern} own={own.mainConcern}>
        <Text text={v.mainConcern} terms={terms} />
      </Row>
      <Row icon={<ClockIcon />} heading={c.sections.duration} own={own.duration}>
        <Text text={v.duration.stated ? v.duration.text : ""} terms={terms} />
      </Row>
      <Row icon={<RepeatIcon />} heading={c.sections.frequency} own={own.frequency}>
        <Text text={v.frequencyAndPattern} terms={terms} />
      </Row>
      <Row icon={<RepeatIcon />} heading={c.sections.changes} own={own.changes}>
        <List items={v.changesAndTriggers} terms={terms} />
      </Row>
      <Row icon={<PillIcon />} tint="coral" heading={c.sections.medicines} own={own.medicines}>
        <List items={m.provided ? m.medicines.map(medicineLine) : []} terms={terms} />
      </Row>
      <Row icon={<HeartIcon />} tint="coral" heading={c.sections.previousSupport} own={own.previousSupport}>
        <List items={m.previousSupport} terms={terms} />
      </Row>
      <Row icon={<HeartIcon />} tint="coral" heading={c.sections.worries} own={own.worries}>
        <List items={v.worriesAndBarriers} terms={terms} />
      </Row>
      <Row icon={<QuestionIcon />} heading={c.sections.questions}>
        <List items={v.questionsToAsk} terms={terms} ordered />
      </Row>
      <Row icon={<BagIcon />} heading={c.sections.whatToBring}>
        <List items={v.whatToBring} terms={terms} />
      </Row>
    </div>
  );
}

/**
 * Journey 1 result (FR-01, FR-03): user version and English master side by side via a segmented
 * control, the user's own words beside each section, and the static routes and disclaimer.
 */
export function ResultView({ result, ownWords, urgentContent, languages, onNotQuite }: ResultViewProps) {
  const { english, user } = result;
  const [tab, setTab] = useState<Tab>(user ? "user" : "english");
  const [matched, setMatched] = useState(false);
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

  return (
    <div className={styles.page}>
      <TopBar backLabel={c.actions.backToAnswers} onBack={onNotQuite} />
      <main className={styles.main}>
        {urgentLevel && (
          <UrgentBanner
            level={urgentLevel}
            content={urgentMessageFor(urgentContent, urgentLevel)}
            showDraftLabel={urgentContent.showDraftLabel}
            draftLabel={urgentContent.draftLabel}
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
          <p className={styles.lead}>{c.lead}</p>
          {detected && <p className={styles.caption}>{c.weReadThisAs(detected)}</p>}
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
          <Summary v={shown} own={ownWords.sections} />

          {answeredFollowUps.length > 0 && (
            <section className={styles.block} aria-labelledby="result-followups" dir="ltr" lang="en">
              <h2 id="result-followups" className={styles.blockHeading}>
                {c.sections.followUps}
              </h2>
              {answeredFollowUps.map((f, i) => (
                <figure key={i} className={styles.quote}>
                  <figcaption className={styles.quoteHeading}>{f.question}</figcaption>
                  {f.answer ? (
                    <blockquote className={styles.quoteText} dir="auto">
                      <p>{f.answer}</p>
                    </blockquote>
                  ) : (
                    <p className={styles.notMentioned}>{c.skippedQuestion}</p>
                  )}
                </figure>
              ))}
            </section>
          )}

          <section className={styles.block} aria-labelledby="result-not-mentioned">
            <h2 id="result-not-mentioned" className={styles.blockHeading}>
              {c.sections.notMentioned}
            </h2>
            {shown.notMentioned.length > 0 && <p className={styles.lead}>{c.notMentionedLead}</p>}
            <div className={styles.plainCard}>
              <List items={shown.notMentioned} terms={terms} />
            </div>
          </section>
        </div>

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

        <section className={styles.block} aria-labelledby="result-routes" dir={dir} lang={lang}>
          <h2 id="result-routes" className={styles.blockHeading}>
            {c.sections.serviceRoutes}
          </h2>
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
        </section>

        <section className={styles.block} aria-labelledby="result-disclaimer" dir={dir} lang={lang}>
          <h2 id="result-disclaimer" className={styles.blockHeading}>
            {c.sections.disclaimer}
          </h2>
          <div className={styles.disclaimer}>
            {shown.disclaimer.map((d, i) => (
              <p key={i}>{d}</p>
            ))}
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        {/* Placeholders: PDF (FR-10) and feedback (FR-16) are separate tasks. */}
        <Button variant="tertiary" disabled title={c.actions.comingSoon}>
          {c.actions.savePdf}
        </Button>
        <Button variant="tertiary" disabled title={c.actions.comingSoon}>
          {c.actions.feedback}
        </Button>
      </footer>
    </div>
  );
}
