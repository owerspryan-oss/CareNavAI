"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ExplainResult } from "@/lib/client/understand";
import { requestRestyle } from "@/lib/client/restyle";
import { applyPostPlayful, playfulLanguage } from "@/lib/restyle/fields";
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
} from "@/components/ui/icons";
import { LetterPhoto } from "@/components/understand/LetterPhoto";
import { useUiLang } from "@/components/i18n/UiProvider";
import { useExplainCopy, useResultCopy, type ExplainCopy } from "./copy";
import styles from "./ResultView.module.css";
import own from "./ExplainResultView.module.css";
import { AccountPrompt } from "./AccountPrompt";
import { FeedbackPrompt } from "./FeedbackPrompt";
import { SavePdfButton } from "./SavePdfButton";
import { useResultLayout } from "./useResultLayout";
import { PlayfulNote, usePlayful } from "./usePlayful";

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
  /**
   * A saved explanation reopened from the account page (FR-14): the back chevron returns there, and the
   * language picker, feedback and account cards are left out.
   */
  readOnly?: boolean;
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

/**
 * The exact words from the confirmed letter behind one point (DESIGN_SYSTEM.md §7, rule 7). Shown under
 * every point at once when the person turns on "Show letter's words", rather than a chip on each point.
 */
function Source({ quote, show }: { quote: string; show: boolean }) {
  const c = useExplainCopy();
  const ui = useUiLang();
  if (!show) return null;
  return (
    <figure className={styles.quote}>
      <figcaption className={styles.quoteHeading} {...ui}>
        {c.fromLetter}
      </figcaption>
      {/* The letter's own words, not translated: no lang/dir override from the version on screen. */}
      <blockquote className={styles.quoteText} dir="auto">
        <p>{quote}</p>
      </blockquote>
    </figure>
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

/** A section with nothing in it is left out entirely, rather than shown as an empty box. */
function Section({ id, heading, children }: { id: string; heading: string; children: ReactNode[] }) {
  const ui = useUiLang();
  if (children.length === 0) return null;
  return (
    <section className={styles.block} aria-labelledby={`explain-${id}`}>
      <h2 id={`explain-${id}`} className={styles.blockHeading} {...ui}>
        {heading}
      </h2>
      <ul className={`${styles.card} ${own.items}`}>{children}</ul>
    </section>
  );
}

/**
 * The explanation's sections. `deckable` can be shown one card at a time; `unclear` is always shown
 * in full, never only at the back of a deck (DECISIONS.md, 2026-10-21).
 */
function explanationSections(
  view: UnderstandView,
  showSources: boolean,
  c: ExplainCopy,
  ui: { lang: string; dir: "ltr" | "rtl" },
): { deckable: { id: string; heading: string; node: ReactNode }[]; unclear: ReactNode } {
  const t = view.terms;
  const told = (
    <Section key="told" id="told" heading={c.sections.told}>
      {view.told.map((item, i) => (
        <Item key={i} icon={<ChatIcon />}>
          <p>
            <Hl text={item.text} terms={t} />
          </p>
          <Source quote={item.sourceQuote} show={showSources} />
        </Item>
      ))}
    </Section>
  );
  const means = (
    <Section key="means" id="means" heading={c.sections.means}>
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
    <Section key="steps" id="steps" heading={c.sections.steps}>
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
          <Source quote={item.sourceQuote} show={showSources} />
        </Item>
      ))}
    </Section>
  );
  const medicines = view.medicines.length === 0 ? null : (
    <section key="medicines" className={styles.block} aria-labelledby="explain-medicines">
      <h2 id="explain-medicines" className={styles.blockHeading} {...ui}>
        {c.sections.medicines}
      </h2>
      {/* AC-02.5 */}
      <p className={own.check} {...ui}>
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
            <Source quote={m.sourceQuote} show={showSources} />
          </Item>
        ))}
      </ul>
    </section>
  );
  const unclear = (
    <Section id="unclear" heading={c.sections.unclear}>
      {view.unclear.map((item, i) => (
        <Item key={i} icon={<QuestionIcon />}>
          <p>
            <Hl text={item.item} terms={t} />
          </p>
          <p className={own.ask} {...ui}>
            {c.whoToAsk[item.whoToAsk]}
          </p>
        </Item>
      ))}
    </Section>
  );
  return {
    deckable: [
      { id: "told", heading: c.sections.told, node: told, count: view.told.length },
      { id: "means", heading: c.sections.means, node: means, count: view.means.length },
      { id: "steps", heading: c.sections.steps, node: steps, count: view.steps.length },
      { id: "medicines", heading: c.sections.medicines, node: medicines, count: view.medicines.length },
    ]
      .filter((x) => x.count > 0)
      .map(({ id, heading, node }) => ({ id, heading, node })),
    unclear,
  };
}

function Fact({ label, value, terms }: { label: string; value: string | null; terms: string[] }) {
  const c = useExplainCopy();
  const ui = useUiLang();
  return (
    <div className={own.fact}>
      <dt {...ui}>{label}</dt>
      <dd>
        {value ? (
          <Hl text={value} terms={terms} />
        ) : (
          <span className={styles.notMentioned} {...ui}>
            {c.medicine.notStated}
          </span>
        )}
      </dd>
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
  readOnly = false,
}: ExplainResultViewProps) {
  const c = useExplainCopy();
  const rc = useResultCopy();
  const ui = useUiLang();
  const { english, user } = result;
  const [tab, setTab] = useState<Tab>(user ? "user" : "english");
  const [layout, setLayout] = useResultLayout();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showSources, setShowSources] = useState(false);
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

  // FR-23: not on a saved explanation, and never on a result with an urgent notice (AC-23.3).
  // A new result (another output language) starts plain again.
  const playfulLang = readOnly ? null : playfulLanguage(result, languages);
  const playful = usePlayful(result, playfulLang !== null, async () => {
    const fields = playfulLang ? await requestRestyle({ flow: "understand", language: playfulLang, english }) : null;
    return fields && user ? applyPostPlayful(user, fields) : null;
  });

  const isUser = tab === "user" && user !== null;
  const shown = isUser ? (playful.version ?? user) : english;
  const urgentLevel = english.meta.urgentAcknowledged;
  const detected = detectedLanguageName(english.meta.detectedLanguage, languages);
  const dir = versionDir(shown.meta, languages);
  const lang = shown.meta.outputMode === "translation" ? shown.meta.outputLanguage : "en";
  const view = buildUnderstandView(shown, english, confirmedText);
  const sections = explanationSections(view, showSources, c, ui);

  return (
    <div className={`${styles.page} ${photoUrl ? own.withPhoto : ""}`}>
      <TopBar backLabel={readOnly ? rc.savedView.back : c.actions.backToWords} onBack={onBack} />
      <main className={`${styles.main} ${own.main}`}>
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
          {detected && <p className={styles.caption}>{rc.weReadThisAs(detected)}</p>}
        </div>

        {/* One quiet row of view options; the language picker only opens when asked for. */}
        <div className={styles.viewOptions}>
          <Button variant="link" onClick={() => setShowSources(!showSources)} aria-pressed={showSources}>
            {showSources ? c.hideSources : c.showSources}
          </Button>
          {!readOnly && (
            <Button variant="link" onClick={() => setPickerOpen(!pickerOpen)} aria-expanded={pickerOpen} aria-controls="explain-picker">
              {c.languagePicker.toggle}
            </Button>
          )}
          {isUser && (
            <Button variant="link" onClick={() => setLayout(layout === "deck" ? "list" : "deck")}>
              {layout === "deck" ? rc.layout.toList : rc.layout.toDeck}
            </Button>
          )}
          {isUser && playfulLang && (
            <Button variant="link" onClick={playful.toggle} aria-pressed={playful.status === "on"} aria-busy={playful.status === "loading" || undefined}>
              {playful.status === "on" ? rc.playful.turnOff : rc.playfulOn(languages[playfulLang]?.nativeName ?? playfulLang)}
            </Button>
          )}
        </div>
        {isUser && playfulLang && <PlayfulNote status={playful.status} />}

        <div className={own.picker} id="explain-picker" hidden={readOnly || !pickerOpen}>
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
          key={`${tab}-${shown.meta.outputLanguage}-${playful.status === "on"}`}
          id="explain-panel"
          role={user ? "tabpanel" : undefined}
          aria-labelledby={user ? `explain-tab-${tab}` : undefined}
          aria-busy={updating || undefined}
          className={`${styles.panel} ${own.panel}`}
          dir={dir}
          lang={lang}
        >
          {/* The deck is only for the person's own version; the doctor's English version is always a list. */}
          {isUser && layout === "deck" && sections.deckable.length > 0 ? (
            <CardDeck
              label={rc.layout.deckLabel}
              labels={rc.layout}
              cards={sections.deckable.map(({ id, heading, node }) => ({ id, title: heading, titleInBody: true, body: node }))}
            />
          ) : sections.deckable.length > 0 ? (
            sections.deckable.map((x) => x.node)
          ) : (
            // Nothing could be grounded: say so plainly rather than show an empty explanation.
            <p className={`${styles.plainCard} ${styles.notMentioned}`}>{c.nothingFound}</p>
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
          <section className={own.notFound} aria-labelledby="explain-not-found">
            <h2 id="explain-not-found" className={own.notFoundHeading} {...ui}>
              {c.notFound.heading}
            </h2>
            <p className={own.notFoundLead} {...ui}>
              {c.notFound.lead}
            </p>
            <ul className={own.notFoundList} dir="ltr" lang="en">
              {view.notFound.map((n, i) => (
                <li key={i}>{n.text}</li>
              ))}
            </ul>
          </section>
        )}

        {!readOnly && (
          <>
            <FeedbackPrompt flow="understand" language={(user ?? english).meta.outputLanguage} />
            <AccountPrompt saved={result.saved} />
          </>
        )}

        <div className={styles.moreInfo} dir={dir} lang={lang}>
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
        <SavePdfButton body={{ flow: "understand", english, user }} />
      </footer>
    </div>
  );
}
