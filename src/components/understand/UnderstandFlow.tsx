"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { GateResult } from "@/lib/ai/schemas";
import type { CallError } from "@/lib/client/call";
import type { DemoLetterPreset } from "@/lib/demo/presets";
import { resizeToJpeg } from "@/lib/client/image";
import { fitContext, followUpContext, mostCautious, screenText } from "@/lib/client/screen";
import {
  extractLetter,
  fetchExplain,
  fetchTranslation,
  fetchLetterFollowUps,
  type ExplainResult,
  type ExtractProblem,
  type MedicineCandidate,
  type PostAnsweredFollowUp,
  type PostFollowUpQuestion,
} from "@/lib/client/understand";
import type { LanguageNames } from "@/lib/result/view";
import type { UrgentContent } from "@/lib/safety/urgent-content";
import { letterTerms } from "@/lib/understand/view";
import { DemoMenu } from "@/components/demo/DemoMenu";
import { UnreviewedNotice } from "@/components/i18n/LanguagePicker";
import { useUi } from "@/components/i18n/UiProvider";
import { FollowUpsStep } from "@/components/prepare/FollowUpsStep";
import { SummaryStatus } from "@/components/prepare/SummaryStatus";
import { ExplainResultView } from "@/components/result/ExplainResultView";
import { UrgentGate } from "@/components/safety/UrgentGate";
import { Button } from "@/components/ui/Button";
import { TopBar } from "@/components/ui/TopBar";
import { CameraIcon, ChevronRightIcon, EyeOffIcon, LockIcon, PencilIcon } from "@/components/ui/icons";
import { useUnderstandCopy } from "./copy";
import { LetterPhoto } from "./LetterPhoto";
import { LetterQuote } from "./LetterQuote";
import { LetterTextArea } from "./LetterTextArea";
import p from "@/components/prepare/PrepareFlow.module.css";
import styles from "./Understand.module.css";

export interface UnderstandFlowProps {
  /** MAX_IMAGE_PX from server config: photos are resized to this before upload (AC-08.1). */
  maxImagePx: number;
  /** MAX_LETTER_CHARS: the limit for the letter text. */
  maxLetterChars: number;
  /** MAX_TEXT_CHARS: the limit for each follow-up answer. */
  maxAnswerChars: number;
  /** MAX_SCREEN_CONTEXT_CHARS: the most earlier-answer text sent with one screen call, as classifier context. */
  contextMaxChars: number;
  /** Static urgent-message content and URGENT_MODE, built on the server (getUrgentContent). */
  urgentContent: UrgentContent;
  /** Static guest provider notice (content/disclaimers, FR-11). */
  providerNotice: string[];
  /** Language names and direction from config/languages.json. */
  languages: LanguageNames;
  /** Fictional demo letters, passed only when DEMO_MODE is on (FR-26). */
  demo?: DemoLetterPreset[];
}

type Source = "typed" | "photo";
type PhotoProblem = ExtractProblem | "unreadable";

type Stage =
  | { name: "choose" }
  | { name: "advice" }
  | { name: "reading" }
  | { name: "photoProblem"; problem: PhotoProblem }
  | { name: "confirm" }
  | { name: "followups"; questions: PostFollowUpQuestion[]; busy: boolean }
  | { name: "loading" }
  | { name: "error"; error: CallError; followUps: PostAnsweredFollowUp[] }
  | { name: "result"; result: ExplainResult; followUps: PostAnsweredFollowUp[] };

/** An urgent result waiting on the person. `letter`: the letter itself was screened, so quote it (AC-05.9). */
type PendingGate = {
  result: GateResult;
  letter: boolean;
  resume: { to: "followups" } | { to: "explain"; followUps: PostAnsweredFollowUp[] };
};

/** A gate result that stopped the journey. A `clear` here would be a bug: route it up anyway. */
function routeUp(g: GateResult): GateResult {
  return g.level === "clear" ? { ...g, level: "uncertain", messageKey: "urgent" } : g;
}

/**
 * Journey 2, "Understand what I was told" (PRD §3.3; FR-08, FR-22, FR-02, FR-03, FR-21).
 * Add a letter (photo or typed) → confirm the words → urgency gate → up to 3 follow-ups → explanation.
 * Everything lives in React state only: the photo is an in-memory object URL, revoked when it is
 * replaced or the page is left (AC-08.5, AC-08.6). Nothing is explained until the person confirms
 * the text and the gate returns `clear` or they acknowledge the urgent message (CLAUDE.md rules 1-2).
 */
export function UnderstandFlow({
  maxImagePx,
  maxLetterChars,
  maxAnswerChars,
  contextMaxChars,
  urgentContent,
  providerNotice,
  languages,
  demo,
}: UnderstandFlowProps) {
  const c = useUnderstandCopy();
  /** The language the person reads the app in is where the explanation starts (2026-10-25). */
  const { language: preference } = useUi();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>({ name: "choose" });
  const [source, setSource] = useState<Source>("typed");
  const [text, setText] = useState("");
  const [textError, setTextError] = useState<string | undefined>();
  const [candidates, setCandidates] = useState<MedicineCandidate[]>([]);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  /** The text as confirmed: the gate input and the grounding source. */
  const [confirmed, setConfirmed] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [gate, setGate] = useState<PendingGate | null>(null);
  const [busy, setBusy] = useState(false);
  const [outputLanguage, setOutputLanguage] = useState<string | null>(preference);
  const [updating, setUpdating] = useState(false);
  const [updateFailed, setUpdateFailed] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  /** Explanations already made for an identical request, and the last one shown. */
  const explained = useRef(new Map<string, ExplainResult>());
  const lastExplained = useRef<{ request: Parameters<typeof fetchExplain>[0]; result: ExplainResult } | null>(null);

  // AC-08.6: the photo exists only as this object URL. Revoke it when it's replaced or the page is left.
  useEffect(() => {
    if (!photoUrl) return;
    return () => URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  // Move focus to the new screen's heading so screen readers announce it (not on first load).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (gate) return;
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [stage.name, gate]);

  function startAgain() {
    setGate(null);
    setStage({ name: "choose" });
    setSource("typed");
    setText("");
    setTextError(undefined);
    setCandidates([]);
    setPhotoUrl(null);
    setConfirmed("");
    setAcknowledged(false);
    setOutputLanguage(preference);
    setUpdateFailed(false);
    explained.current.clear();
    lastExplained.current = null;
  }

  function chooseTyping() {
    if (source === "photo") {
      setPhotoUrl(null);
      setText("");
      setCandidates([]);
    }
    setSource("typed");
    setTextError(undefined);
    setStage({ name: "confirm" });
  }

  async function onPhotoChosen(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so the same photo can be chosen again after a retake
    if (file) await readPhoto(file);
  }

  async function readPhoto(file: Blob) {
    setPhotoUrl(null);
    setStage({ name: "reading" });

    let jpeg: Blob;
    try {
      jpeg = await resizeToJpeg(file, maxImagePx);
    } catch {
      setStage({ name: "photoProblem", problem: "unreadable" });
      return;
    }
    setPhotoUrl(URL.createObjectURL(jpeg));

    const out = await extractLetter(jpeg);
    if (out.kind === "problem") {
      // AC-08.4: never continue with a photo we couldn't read. Discard it and ask again.
      setPhotoUrl(null);
      setStage({ name: "photoProblem", problem: out.problem });
      return;
    }
    setSource("photo");
    setText(out.text);
    setCandidates(out.medicineCandidates);
    setTextError(undefined);
    setStage({ name: "confirm" });
  }

  /** AC-08.3: nothing is explained until the person confirms the text. Then the gate runs first. */
  async function onConfirm() {
    if (busy) return;
    if (text.trim() === "") {
      setTextError(c.confirm.required);
      return;
    }
    if (text.length > maxLetterChars) return;
    // Back from the result without changing the words: show that result again, with no new calls.
    const last = lastExplained.current;
    if (last && last.request.confirmedText === text && last.request.source === source) {
      setAcknowledged(last.request.acknowledgedUrgent);
      setOutputLanguage(last.request.outputLanguage);
      setUpdateFailed(false);
      setStage({ name: "result", result: last.result, followUps: last.request.followUps });
      return;
    }
    setBusy(true);
    const result = await screenText(text, "letter_text", null);
    setConfirmed(text);
    // A new confirmation is a new letter: any earlier acknowledgement or answers no longer apply, and the
    // output language starts again from the person's own language.
    setAcknowledged(false);
    setOutputLanguage(preference);
    setUpdateFailed(false);
    if (result.level !== "clear") {
      setBusy(false);
      setGate({ result, letter: true, resume: { to: "followups" } });
      return;
    }
    await startFollowUps(text, false);
    setBusy(false);
  }

  /** FR-22: up to 3 clarity-only questions. None, or any failure, goes straight on to the explanation. */
  async function startFollowUps(letter: string, ack: boolean) {
    const out = await fetchLetterFollowUps(letter, ack);
    if (out.kind === "urgent") {
      setGate({ result: routeUp(out.gate), letter: true, resume: { to: "followups" } });
    } else if (out.kind === "followups" && out.questions.length > 0) {
      setStage({ name: "followups", questions: out.questions, busy: false });
    } else {
      await requestExplain(letter, [], ack, preference);
    }
  }

  /** Every follow-up answer passes the gate before the journey continues (AC-22.5). */
  async function submitFollowUps(followUps: PostAnsweredFollowUp[]) {
    if (stage.name !== "followups" || stage.busy) return;
    setStage({ ...stage, busy: true });
    // Each answer is read with its own question and the answers before it (not the letter: it was screened on its own).
    const screens = followUps.flatMap((f, i) =>
      f.answer === null ? [] : [screenText(f.answer, "followup_answer", null, fitContext(followUpContext(followUps, i), contextMaxChars))],
    );
    const worst = mostCautious(await Promise.all(screens));
    if (worst) {
      setStage({ ...stage, busy: false });
      setGate({ result: worst, letter: false, resume: { to: "explain", followUps } });
      return;
    }
    await requestExplain(confirmed, followUps, acknowledged, outputLanguage);
  }

  /** The explanation call. The server re-screens the letter and answers first. */
  async function requestExplain(letter: string, followUps: PostAnsweredFollowUp[], ack: boolean, lang: string | null) {
    const request = { confirmedText: letter, source, followUps, acknowledgedUrgent: ack, outputLanguage: lang };
    const cached = explained.current.get(JSON.stringify(request));
    if (cached) {
      setStage({ name: "result", result: cached, followUps });
      return;
    }
    setStage({ name: "loading" });
    const out = await fetchExplainOnce(request);
    if (out.kind === "urgent") {
      setGate({ result: routeUp(out.gate), letter: true, resume: { to: "explain", followUps } });
    } else if (out.kind === "error") {
      setStage({ name: "error", error: out.error, followUps });
    } else {
      setStage({ name: "result", result: out, followUps });
    }
  }

  /** fetchExplain, reusing an earlier result for the identical request (token cost: going back and forth, switching language). */
  async function fetchExplainOnce(request: Parameters<typeof fetchExplain>[0]) {
    const key = JSON.stringify(request);
    const cached = explained.current.get(key);
    if (cached) return cached;
    const out = await fetchExplain(request);
    if (out.kind === "result") {
      explained.current.set(key, out);
      lastExplained.current = { request, result: out };
    }
    return out;
  }

  /** "Show me this in": re-request in another language, keeping the current result on screen meanwhile. */
  async function changeLanguage(lang: string | null) {
    if (stage.name !== "result" || updating) return;
    const { followUps } = stage;
    const previous = outputLanguage;
    setOutputLanguage(lang);
    setUpdating(true);
    setUpdateFailed(false);
    const request = { confirmedText: confirmed, source, followUps, acknowledgedUrgent: acknowledged, outputLanguage: lang };
    // Translate the same English master only; a refused or failed translation falls back to a full explanation.
    let out = explained.current.get(JSON.stringify(request)) ?? (await fetchTranslation(stage.result, lang));
    if (out.kind === "result") {
      explained.current.set(JSON.stringify(request), out);
      lastExplained.current = { request, result: out };
    } else out = await fetchExplainOnce(request);
    setUpdating(false);
    if (out.kind === "result") {
      setStage({ name: "result", result: out, followUps });
    } else if (out.kind === "urgent") {
      setGate({ result: routeUp(out.gate), letter: true, resume: { to: "explain", followUps } });
    } else {
      setOutputLanguage(previous);
      setUpdateFailed(true);
    }
  }

  function onAcknowledged(pending: PendingGate) {
    setGate(null);
    setAcknowledged(true);
    if (pending.resume.to === "followups") {
      setStage({ name: "loading" });
      void startFollowUps(confirmed, true);
    } else {
      void requestExplain(confirmed, pending.resume.followUps, true, outputLanguage);
    }
  }

  const backToWords = () => setStage({ name: "confirm" });

  if (gate) {
    return (
      <UrgentGate
        result={gate.result}
        content={urgentContent}
        onStartAgain={startAgain}
        onAcknowledge={() => onAcknowledged(gate)}
        sourceText={gate.letter ? <LetterQuote text={confirmed} /> : undefined}
      />
    );
  }

  if (stage.name === "followups") {
    return (
      <FollowUpsStep
        questions={stage.questions}
        lead={c.followUpsLead}
        maxChars={maxAnswerChars}
        busy={stage.busy}
        onContinue={(answers) => void submitFollowUps(answers)}
        onBack={backToWords}
      />
    );
  }
  if (stage.name === "loading") return <SummaryStatus kind="loading" copy={c.status} />;
  if (stage.name === "error") {
    const { followUps } = stage;
    return (
      <SummaryStatus
        kind="error"
        copy={c.status}
        error={stage.error}
        onRetry={() => void requestExplain(confirmed, followUps, acknowledged, outputLanguage)}
        onBackToAnswers={backToWords}
      />
    );
  }
  if (stage.name === "result") {
    return (
      <ExplainResultView
        result={stage.result}
        confirmedText={confirmed}
        photoUrl={photoUrl}
        urgentContent={urgentContent}
        languages={languages}
        outputLanguage={outputLanguage}
        onOutputLanguage={(lang) => void changeLanguage(lang)}
        updating={updating}
        updateFailed={updateFailed}
        onBack={backToWords}
      />
    );
  }

  const fileInputs = (
    <>
      {/* AC-08.1: the chosen photo is resized and re-encoded in the browser before upload. */}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onPhotoChosen(e)} data-testid="camera-input" />
      <input ref={libraryInput} type="file" accept="image/*" hidden onChange={(e) => void onPhotoChosen(e)} data-testid="library-input" />
    </>
  );

  // Demo mode (FR-26): the demo photo goes through the same resize and extraction as a chosen photo.
  const demoItems = (demo ?? []).map((preset) => ({
    id: `${preset.id}-${preset.kind}`,
    label: `Letter ${preset.kind}: ${preset.id}`,
    onSelect: () => {
      startAgain();
      if (preset.kind === "text") {
        setText(preset.text);
        setStage({ name: "confirm" });
      } else {
        void fetch(preset.dataUrl)
          .then((r) => r.blob())
          .then(readPhoto);
      }
    },
  }));

  if (stage.name === "choose") {
    return (
      <div className={p.page}>
        {demoItems.length > 0 && <DemoMenu items={demoItems} />}
        <TopBar backLabel={c.actions.backToStart} onBack={() => router.push("/")} confirmHome={false} />
        <main className={`${p.main} ${styles.step}`} key="choose">
          <div className={p.intro}>
            <h1 ref={headingRef} tabIndex={-1} className={p.title}>
              {c.choose.title}
            </h1>
            <p className={p.lead}>{c.choose.lead}</p>
            <UnreviewedNotice />
          </div>

          <div className={styles.options}>
            <button type="button" className={styles.option} onClick={() => setStage({ name: "advice" })} data-action="photo">
              <span className={styles.optionBadge} data-tint="coral" aria-hidden="true">
                <CameraIcon />
              </span>
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>{c.choose.photo}</span>
                <span className={styles.optionHint}>{c.choose.photoHint}</span>
              </span>
              <ChevronRightIcon className={styles.optionChevron} />
            </button>
            <button type="button" className={styles.option} onClick={chooseTyping} data-action="type">
              <span className={styles.optionBadge} aria-hidden="true">
                <PencilIcon />
              </span>
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>{c.choose.type}</span>
                <span className={styles.optionHint}>{c.choose.typeHint}</span>
              </span>
              <ChevronRightIcon className={styles.optionChevron} />
            </button>
            {/* Voice slot: "Say it" (FR-07, epic-prepare's recorder) joins these options in a later task. */}
          </div>

          {/* Provider processing is disclosed before first use in one plain sentence; the full notice is a tap away. */}
          <details className={styles.notice}>
            <summary className={styles.noticeHeading}>
              <LockIcon className={styles.noticeIcon} />
              <span>
                {c.choose.noticeSummary} <span className={styles.noticeMore}>{c.choose.noticeMore}</span>
              </span>
            </summary>
            {providerNotice.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </details>
        </main>
      </div>
    );
  }

  if (stage.name === "advice") {
    return (
      <div className={p.page}>
        <TopBar backLabel={c.actions.back} onBack={() => setStage({ name: "choose" })} />
        <main className={`${p.main} ${styles.step}`} key="advice">
          <div className={p.intro}>
            <h1 ref={headingRef} tabIndex={-1} className={p.title}>
              {c.photoAdvice.title}
            </h1>
            <p className={p.lead}>{c.photoAdvice.lead}</p>
          </div>
          {/* AC-08.2: static advice, shown before the camera opens. */}
          <ul className={styles.adviceList}>
            {c.photoAdvice.items.map((item) => (
              <li key={item} className={styles.adviceItem}>
                <span className={styles.optionBadge} data-tint="coral" aria-hidden="true">
                  <EyeOffIcon />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <p>{c.photoAdvice.afterItems}</p>
          <p className={styles.privacy}>
            <LockIcon className={styles.privacyIcon} />
            {c.photoAdvice.privacy}
          </p>
          <Button variant="link" onClick={() => libraryInput.current?.click()} className={styles.secondaryAction}>
            {c.photoAdvice.choosePhoto}
          </Button>
          {fileInputs}
        </main>
        <footer className={p.footer}>
          <Button variant="tertiary" className={p.backButton} onClick={() => setStage({ name: "choose" })}>
            {c.actions.back}
          </Button>
          <Button variant="primary" leadingIcon={<CameraIcon />} onClick={() => cameraInput.current?.click()}>
            {c.photoAdvice.openCamera}
          </Button>
        </footer>
      </div>
    );
  }

  if (stage.name === "reading") {
    return (
      <div className={p.page}>
        <TopBar backLabel={c.actions.back} onBack={() => {}} backDisabled />
        <main className={p.main}>
          <div className={p.status} role="status" aria-live="polite">
            <span className={p.statusSpinner} aria-hidden="true" />
            <h1 ref={headingRef} tabIndex={-1} className={p.title}>
              {c.reading.title}
            </h1>
            <p className={p.lead}>{c.reading.lead}</p>
          </div>
          {photoUrl && <LetterPhoto url={photoUrl} />}
        </main>
      </div>
    );
  }

  if (stage.name === "photoProblem") {
    const copy = c.photoProblems[stage.problem];
    return (
      <div className={p.page}>
        <TopBar backLabel={c.actions.back} onBack={() => setStage({ name: "choose" })} />
        <main className={p.main}>
          <div className={p.status} role="alert">
            <h1 ref={headingRef} tabIndex={-1} className={p.title}>
              {copy.title}
            </h1>
            <p className={p.lead}>{copy.body}</p>
            <div className={p.statusActions}>
              <Button variant="primary" fullWidth leadingIcon={<CameraIcon />} onClick={() => setStage({ name: "advice" })}>
                {c.retake}
              </Button>
              <Button variant="link" fullWidth onClick={chooseTyping}>
                {c.typeInstead}
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Confirm (AC-08.3): editable text with medicine names, doses and dates highlighted.
  const terms = letterTerms(text, candidates);
  const isPhoto = source === "photo";
  return (
    <div className={`${p.page} ${isPhoto && photoUrl ? styles.withPhoto : ""}`}>
      <TopBar backLabel={c.actions.back} onBack={() => setStage({ name: "choose" })} backDisabled={busy} />
      <main className={`${p.main} ${styles.step} ${styles.confirmMain}`} key="confirm">
        <div className={p.intro}>
          <h1 ref={headingRef} tabIndex={-1} className={p.title}>
            {isPhoto ? c.confirm.photoTitle : c.confirm.typedTitle}
          </h1>
          <p className={p.lead}>{isPhoto ? c.confirm.photoLead : c.confirm.typedLead}</p>
        </div>

        {isPhoto && photoUrl && (
          <aside className={styles.photoAside}>
            <LetterPhoto url={photoUrl} />
            <Button variant="link" className={styles.alignedLink} onClick={() => setStage({ name: "advice" })} disabled={busy}>
              {c.confirm.retakePhoto}
            </Button>
          </aside>
        )}

        <form
          id="understand-confirm"
          className={styles.confirmForm}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void onConfirm();
          }}
        >
          <LetterTextArea
            id="letter-text"
            label={c.confirm.label}
            placeholder={c.confirm.placeholder}
            value={text}
            onChange={(v) => {
              setText(v);
              setTextError(undefined);
            }}
            terms={terms}
            maxChars={maxLetterChars}
            tooLongMessage={c.errors.tooLong}
            error={textError}
            readOnly={busy}
          />
          {terms.length > 0 && (
            <div className={styles.found}>
              <p className={styles.foundLabel}>{c.confirm.found}</p>
              <ul className={styles.foundList}>
                {terms.map((t) => (
                  <li key={t}>
                    <mark className={styles.foundTerm}>{t}</mark>
                  </li>
                ))}
              </ul>
              <p className={styles.foundCheck}>{c.confirm.checkThese}</p>
            </div>
          )}
        </form>
      </main>
      <footer className={p.footer}>
        <Button variant="tertiary" className={p.backButton} onClick={() => setStage({ name: "choose" })} disabled={busy}>
          {c.actions.back}
        </Button>
        <Button
          type="submit"
          form="understand-confirm"
          variant="primary"
          loading={busy}
          loadingLabel={c.confirm.checking}
          disabled={text.length > maxLetterChars}
          trailingChevron
        >
          {c.confirm.confirm}
        </Button>
      </footer>
    </div>
  );
}
