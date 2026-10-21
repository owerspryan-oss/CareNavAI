"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ExplainResult } from "@/lib/client/understand";
import { urgentMessageFor, type UrgentContent } from "@/lib/safety/urgent-content";
import {
  detectedLanguageName,
  doseAndDateTerms,
  highlightSegments,
  userTabLabel,
  versionDir,
  type LanguageNames,
} from "@/lib/result/view";
import { buildUnderstandView, type UnderstandView } from "@/lib/understand/view";
import { UrgentBanner } from "@/components/safety/UrgentBanner";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { CardDeck } from "@/components/ui/CardDeck";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { TopBar } from "@/components/ui/TopBar";
import {
  CalendarIcon,
  CautionIcon,
  ChatIcon,
  ChevronDownIcon,
  DocumentIcon,
  PillIcon,
  QuestionIcon,
  QuoteIcon,
} from "@/components/ui/icons";
import { LetterPhoto } from "@/components/understand/LetterPhoto";
import { explainCopy as c, resultCopy as rc } from "./copy";
import styles from "./ResultView.module.css";
import own from "./ExplainResultView.module.css";
import { SavePdfButton } from "./SavePdfButton";
import { useResultLayout } from "./useResultLayout";

export interface ExplainResultViewProps {
  result: ExplainResult;
  /** The letter text the person confirmed: the grounding source, re-checked here (CLAUDE.md rule 7). */
  confirmedText: string;
  /** In-memory object URL of the letter photo (AC-08.6), or null for typed text. Owned by the caller. */
  photoUrl: string | null;
  /** Static urgent content (server-built) for the persistent banner (v0.3 A2). Never model text. */
  urgentContent: UrgentContent;
  languages: LanguageNames;
  /** The "Show me this in" choice: null = the default (simple English for an English letter). */
  outputLanguage: string | null;
  onOutputLanguage: (code: string | null) => void;
  /** True while a different output language is being requested. */
  updating: boolean;
  /** The last language request failed; the previous result is still shown. */
  updateFailed: boolean;
  onBack: () => void;
}

type Tab = "user" | "english";

/** Model text, rendered as React text only, with medicine names, doses and dates highlighted (AC-02.5). */
function Hl({ text, terms }: { text: string; terms: string[] }) {
  return (
    <>
      {highlightSegments(text, [...terms, ...doseAndDateTerms(text)]).map((s, i) =>
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

/** "Show source ⌄": the exact words from the confirmed letter (DESIGN_SYSTEM.md §7). */
function Source({ quote }: { quote: string }) {
  return (
    <details className={styles.disclosure}>
      <summary className={styles.chip}>
        <DocumentIcon className={styles.chipIcon} />
        {c.showSource}
        <ChevronDownIcon className={styles.chipChevron} />
      </summary>
      <figure className={styles.quote}>
        <QuoteIcon className={styles.quoteIcon} />
        <figcaption className={styles.quoteHeading}>{c.fromLetter}</figcaption>
        {/* The letter's own words, not translated: no lang/dir override from the version on screen. */}
        <blockquote className={styles.quoteText} dir="auto">
          <p>{quote}</p>
        </blockquote>
      </figure>
    </details>
  );
}

function Item({ icon, tint = "teal", children }: { icon: ReactNode; tint?: "teal" | "coral"; children: ReactNode }) {
  return (
    <li className={styles.row}>
      <span className={styles.badge} data-tint={tint} aria-hidden="true">
        {icon}
      </span>
      <div className={styles.rowBody}>{children}</div>
    </li>
  );
}

function Section({ id, heading, empty, children }: { id: string; heading: string; empty: string; children: ReactNode[] }) {
  return (
    <section className={styles.block} aria-labelledby={`explain-${id}`}>
      <h2 id={`explain-${id}`} className={styles.blockHeading}>
        {heading}
      </h2>
      {children.length > 0 ? (
        <ul className={`${styles.card} ${own.items}`}>{children}</ul>
      ) : (
        <p className={`${styles.plainCard} ${styles.notMentioned}`}>{empty}</p>
      )}
    </section>
  );
}

/**
 * The explanation's sections. `deckable` can be shown one card at a time; `unclear` is always shown
 * in full, never only at the back of a deck (DECISIONS.md, 2026-10-21).
 */
function explanationSections(view: UnderstandView): { deckable: { id: string; heading: string; node: ReactNode }[]; unclear: ReactNode } {
  const t = view.terms;
  const told = (
    <Section key="told" id="told" heading={c.sections.told} empty={c.empty.told}>
      {view.told.map((item, i) => (
        <Item key={i} icon={<ChatIcon />}>
          <p>
            <Hl text={item.text} terms={t} />
          </p>
          <Source quote={item.sourceQuote} />
        </Item>
      ))}
    </Section>
  );
  const means = (
    <Section key="means" id="means" heading={c.sections.means} empty={c.empty.means}>
      {view.means.map((item, i) => (
        <Item key={i} icon={<DocumentIcon />}>
          {/* The clinician's own words, quoted from the letter. */}
          <p className={own.term}>“{item.clinicianWords}”</p>
          <p>
            <Hl text={item.plainMeaning} terms={t} />
          </p>
        </Item>
      ))}
    </Section>
  );
  const steps = (
    <Section key="steps" id="steps" heading={c.sections.steps} empty={c.empty.steps}>
      {view.steps.map((item, i) => (
        <Item key={i} icon={<CalendarIcon />}>
          <p>
            <Hl text={item.action} terms={t} />
          </p>
          {item.byWhen && (
            <p className={own.detail}>
              <Hl text={c.byWhen(item.byWhen)} terms={t} />
            </p>
          )}
          <Source quote={item.sourceQuote} />
        </Item>
      ))}
    </Section>
  );
  const medicines = (
    <section key="medicines" className={styles.block} aria-labelledby="explain-medicines">
      <h2 id="explain-medicines" className={styles.blockHeading}>
        {c.sections.medicines}
      </h2>
      {view.medicines.length > 0 ? (
        <>
          {/* AC-02.5 */}
          <p className={own.check}>
            <CautionIcon className={own.checkIcon} />
            {c.checkThese}
          </p>
          <ul className={`${styles.card} ${own.items}`}>
            {view.medicines.map((m, i) => (
              <Item key={i} icon={<PillIcon />} tint="coral">
                <p className={own.medicineName}>
                  <Hl text={m.dose ? `${m.name} ${m.dose}` : m.name} terms={t} />
                </p>
                <dl className={own.facts}>
                  {m.dose === null && <Fact label={c.medicine.dose} value={null} terms={t} />}
                  <Fact label={c.medicine.frequency} value={m.frequency} terms={t} />
                  <Fact label={c.medicine.duration} value={m.duration} terms={t} />
                  <Fact label={c.medicine.instructions} value={m.instructions} terms={t} />
                </dl>
                <Source quote={m.sourceQuote} />
              </Item>
            ))}
          </ul>
        </>
      ) : (
        <p className={`${styles.plainCard} ${styles.notMentioned}`}>{c.empty.medicines}</p>
      )}
    </section>
  );
  const unclear = (
    <Section id="unclear" heading={c.sections.unclear} empty={c.empty.unclear}>
      {view.unclear.map((item, i) => (
        <Item key={i} icon={<QuestionIcon />}>
          <p>
            <Hl text={item.item} terms={t} />
          </p>
          <p className={own.ask}>{c.whoToAsk[item.whoToAsk]}</p>
        </Item>
      ))}
    </Section>
  );
  return {
    deckable: [
      { id: "told", heading: c.sections.told, node: told },
      { id: "means", heading: c.sections.means, node: means },
      { id: "steps", heading: c.sections.steps, node: steps },
      { id: "medicines", heading: c.sections.medicines, node: medicines },
    ],
    unclear,
  };
}

function Fact({ label, value, terms }: { label: string; value: string | null; terms: string[] }) {
  return (
    <div className={own.fact}>
      <dt>{label}</dt>
      <dd>{value ? <Hl text={value} terms={terms} /> : <span className={styles.notMentioned}>{c.medicine.notStated}</span>}</dd>
    </div>
  );
}

/**
 * Journey 2 result (FR-02, FR-03, AC-08.6): what the letter says, in plainer words, every item backed
 * by a "Show source" quote from the confirmed text. Items not found in the letter are never shown as
 * fact: they sit apart, unhighlighted, under "We couldn't find this in your letter" (CLAUDE.md rule 7).
 */
export function ExplainResultView({
  result,
  confirmedText,
  photoUrl,
  urgentContent,
  languages,
  outputLanguage,
  onOutputLanguage,
  updating,
  updateFailed,
  onBack,
}: ExplainResultViewProps) {
  const { english, user } = result;
  const [tab, setTab] = useState<Tab>(user ? "user" : "english");
  const [layout, setLayout] = useResultLayout();
  // A new result (another language) opens on its user version again.
  const [shownResult, setShownResult] = useState(result);
  if (shownResult !== result) {
    setShownResult(result);
    setTab(user ? "user" : "english");
  }
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
  const view = buildUnderstandView(shown, english, confirmedText);
  const sections = explanationSections(view);

  return (
    <div className={`${styles.page} ${photoUrl ? own.withPhoto : ""}`}>
      <TopBar backLabel={c.actions.backToWords} onBack={onBack} />
      <main className={`${styles.main} ${own.main}`}>
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
            label={rc.tabsLabel}
            idPrefix="explain"
            value={tab}
            onChange={setTab}
            options={[
              { value: "user", label: userTabLabel(user.meta, languages, rc.simpleEnglish) },
              { value: "english", label: rc.forDoctor },
            ]}
          />
        )}

        <Banner tone="caution">
          <span className={styles.bannerLine}>{c.draftNotice}</span>
          {isUser && shown.meta.confidenceNotice && <span className={styles.bannerLine}>{rc.confidenceNotice}</span>}
          {!user && <span className={styles.bannerLine}>{c.englishOnlyNotice}</span>}
        </Banner>

        <div className={styles.intro}>
          <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
            {c.title}
          </h1>
          <p className={styles.lead}>{c.lead}</p>
          {detected && <p className={styles.caption}>{rc.weReadThisAs(detected)}</p>}
        </div>

        <div className={own.picker}>
          <label htmlFor="explain-language" className={own.pickerLabel}>
            {c.languagePicker.label}
          </label>
          <select
            id="explain-language"
            className={own.select}
            value={outputLanguage ?? ""}
            disabled={updating}
            onChange={(e) => onOutputLanguage(e.target.value || null)}
          >
            <option value="">{c.languagePicker.defaultOption}</option>
            {Object.entries(languages)
              .filter(([code]) => code !== "en")
              .map(([code, l]) => (
                <option key={code} value={code}>
                  {l.nativeName === l.englishName ? l.englishName : `${l.englishName} (${l.nativeName})`}
                </option>
              ))}
          </select>
          <p className={own.pickerStatus} role="status" aria-live="polite">
            {updating ? c.languagePicker.updating : updateFailed ? c.languagePicker.failed : ""}
          </p>
        </div>

        <div
          key={`${tab}-${shown.meta.outputLanguage}`}
          id="explain-panel"
          role={user ? "tabpanel" : undefined}
          aria-labelledby={user ? `explain-tab-${tab}` : undefined}
          aria-busy={updating || undefined}
          className={`${styles.panel} ${own.panel}`}
          dir={dir}
          lang={lang}
        >
          {isUser && (
            <Button variant="link" className={styles.layoutToggle} onClick={() => setLayout(layout === "deck" ? "list" : "deck")}>
              {layout === "deck" ? rc.layout.toList : rc.layout.toDeck}
            </Button>
          )}
          {/* The deck is only for the person's own version; the doctor's English version is always a list. */}
          {isUser && layout === "deck" ? (
            <CardDeck
              label={rc.layout.deckLabel}
              labels={rc.layout}
              cards={sections.deckable.map(({ id, heading, node }) => ({ id, title: heading, titleInBody: true, body: node }))}
            />
          ) : (
            sections.deckable.map((x) => x.node)
          )}
          {sections.unclear}
        </div>

        {/* AC-08.6: after the explanation on a phone (the mockup's "From your letter" spot); beside it on wide screens. */}
        {photoUrl && (
          <aside className={own.photo} aria-label={c.fromLetter}>
            <LetterPhoto url={photoUrl} />
          </aside>
        )}

        {view.notFound.length > 0 && (
          // Never styled as fact: no badges, no highlights, no source chips, always the English master's words.
          <section className={own.notFound} aria-labelledby="explain-not-found" dir="ltr" lang="en">
            <h2 id="explain-not-found" className={own.notFoundHeading}>
              {c.notFound.heading}
            </h2>
            <p className={own.notFoundLead}>{c.notFound.lead}</p>
            <ul className={own.notFoundList}>
              {view.notFound.map((n, i) => (
                <li key={i}>{n.text}</li>
              ))}
            </ul>
          </section>
        )}

        <section className={styles.block} aria-labelledby="explain-disclaimer" dir={dir} lang={lang}>
          <h2 id="explain-disclaimer" className={styles.blockHeading}>
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
        <SavePdfButton body={{ flow: "understand", english, user }} />
        {/* Placeholder: feedback (FR-16) is a later task. */}
        <Button variant="tertiary" disabled title={rc.actions.comingSoon}>
          {rc.actions.feedback}
        </Button>
      </footer>
    </div>
  );
}
