"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useUi } from "@/components/i18n/UiProvider";
import { Button } from "./Button";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import {
  SPRING_DEFAULT,
  SPRING_FLICK,
  isSettled,
  rubberband,
  settleIndex,
  stepSpring,
  velocityFrom,
  type SpringParams,
  type SpringState,
} from "@/lib/ui/spring";
import styles from "./CardDeck.module.css";

export interface DeckCard {
  id: string;
  title: string;
  body: ReactNode;
  /** Set when `body` already shows its own heading; `title` then only names the slide for assistive tech. */
  titleInBody?: boolean;
}

export interface CardDeckProps {
  cards: DeckCard[];
  /** Accessible name of the deck, e.g. "Your summary, one card at a time". */
  label: string;
  /** Plain strings so they can come from locale files. `position` uses `{n}` and `{total}`, e.g. "{n} of {total}". */
  labels: { next: string; back: string; position: string };
}

const DRAG_THRESHOLD = 10; // px of movement before a horizontal swipe is committed (§10 hysteresis)
const FLICK_SPEED = 300; // px/s; above this the release gets the bouncier momentum spring

function positionText(template: string, n: number, total: number): string {
  return template.replace("{n}", String(n)).replace("{total}", String(total));
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * A stack of cards the user can swipe through one at a time, with Next/Back buttons and arrow keys
 * as equal alternatives (never swipe-only). Position is a continuous card index driven by a spring:
 * it tracks the finger 1:1, can be grabbed mid-flight, rubber-bands at the ends, and projects a
 * flick to the next card. Under reduced motion it cross-fades instead of sliding.
 */
export function CardDeck({ cards, label, labels }: CardDeckProps) {
  const count = cards.length;
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState(0);
  const pos = useRef<SpringState>({ x: 0, v: 0 });
  const target = useRef(0);
  const params = useRef<SpringParams>(SPRING_DEFAULT);
  const frame = useRef<number | null>(null);
  // Right-to-left (AC-27.3): the deck travels the other way, so every x is mirrored by `s`.
  const ui = useUi();
  const s = ui.dir === "rtl" ? -1 : 1;
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; startX: number; startY: number; startPos: number; startIndex: number; axis: "x" | "y" | null; samples: { t: number; x: number }[] } | null>(null);
  const liveId = useId();

  const render = useCallback((x: number) => setPosition(x), []);

  const animate = useCallback(() => {
    if (frame.current !== null) return;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.064, (now - last) / 1000);
      last = now;
      pos.current = stepSpring(pos.current, target.current, dt, params.current);
      if (isSettled(pos.current, target.current)) {
        pos.current = { x: target.current, v: 0 };
        render(target.current);
        frame.current = null;
        return;
      }
      render(pos.current.x);
      frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }, [render]);

  const goTo = useCallback(
    (next: number, spring: SpringParams = SPRING_DEFAULT, velocity?: number) => {
      const clamped = Math.min(count - 1, Math.max(0, next));
      setIndex(clamped);
      target.current = clamped;
      if (prefersReducedMotion()) {
        pos.current = { x: clamped, v: 0 };
        render(clamped);
        return;
      }
      params.current = spring;
      if (velocity !== undefined) pos.current = { ...pos.current, v: velocity };
      animate();
    },
    [animate, count, render],
  );

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  // The top card fits its own content; the cards underneath take its height, so the stack stays tidy
  // and the controls sit right below it (no empty space padded out to the tallest card).
  const observer = useRef<ResizeObserver | null>(null);
  const measureCurrent = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    if (!el) return;
    const apply = () => viewport.current?.style.setProperty("--deck-card-height", `${el.offsetHeight}px`);
    apply();
    observer.current = new ResizeObserver(apply);
    observer.current.observe(el);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);

  function width(): number {
    return viewport.current?.clientWidth || 1;
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Grabbing mid-flight stops the spring where the card is now (interruptibility, §3).
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, startPos: pos.current.x, startIndex: index, axis: null, samples: [{ t: e.timeStamp, x: e.clientX * s }] };
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = (e.clientX - d.startX) * s;
    const dy = e.clientY - d.startY;
    if (d.axis === null) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      // Vertical intent belongs to the card's own scrolling; let the browser have it.
      if (d.axis === "y") return;
      e.currentTarget.setPointerCapture(e.pointerId);
      // A committed swipe is not a text selection.
      window.getSelection()?.removeAllRanges();
      e.currentTarget.dataset.dragging = "";
    }
    if (d.axis !== "x") return;
    d.samples.push({ t: e.timeStamp, x: e.clientX * s });
    if (d.samples.length > 8) d.samples.shift();
    if (prefersReducedMotion()) return;
    const w = width();
    let x = d.startPos - dx / w;
    if (x < 0) x = -rubberband(-x * w, w) / w;
    if (x > count - 1) x = count - 1 + rubberband((x - (count - 1)) * w, w) / w;
    pos.current = { x, v: 0 };
    render(x);
  }

  function onPointerEnd(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    delete e.currentTarget.dataset.dragging;
    if (!d || d.id !== e.pointerId) return;
    if (d.axis !== "x") {
      // A tap or a vertical scroll: resume any interrupted settle.
      if (pos.current.x !== target.current) animate();
      return;
    }
    const pxPerSec = velocityFrom(d.samples);
    const w = width();
    if (prefersReducedMotion()) {
      const dx = (e.clientX - d.startX) * s;
      goTo(Math.abs(dx) > w / 4 ? d.startIndex + (dx < 0 ? 1 : -1) : d.startIndex);
      return;
    }
    const v = -pxPerSec / w; // card-index units per second
    const next = settleIndex(pos.current.x, v, d.startIndex, count);
    goTo(next, Math.abs(pxPerSec) > FLICK_SPEED ? SPRING_FLICK : SPRING_DEFAULT, v);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(index + (e.key === "ArrowRight" ? 1 : -1) * s);
    }
  }

  return (
    <section className={styles.deck} aria-roledescription="carousel" aria-label={label}>
      <div
        ref={viewport}
        className={styles.viewport}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {cards.map((card, i) => {
          const d = i - position; // <0: swiped away to the left; 0: on top; >0: waiting underneath
          const current = i === index;
          const style =
            i === 0 && position < 0
              ? // Pulled right past the first card: it follows the (rubber-banded) finger, on top.
                { transform: `translate3d(${-position * 100 * s}%, 0, 0)`, zIndex: count + 1, opacity: 1 }
              : d < 0
              ? { transform: `translate3d(${d * 108 * s}%, 0, 0) rotate(${d * 4 * s}deg)`, zIndex: count + 1, opacity: d <= -1 ? 0 : 1 }
              : {
                  transform: `translate3d(0, ${Math.min(d, 2) * 0.625}rem, 0) scale(${1 - Math.min(d, 2) * 0.04})`,
                  zIndex: count - i,
                  opacity: d > 2 ? 0 : 1,
                };
          return (
            <article
              key={card.id}
              ref={current ? measureCurrent : undefined}
              className={styles.card}
              style={style}
              data-current={current || undefined}
              role="group"
              aria-roledescription="slide"
              aria-label={`${positionText(labels.position, i + 1, count)}: ${card.title}`}
              aria-hidden={!current}
              inert={!current}
            >
              {!card.titleInBody && <h3 className={styles.title}>{card.title}</h3>}
              <div className={styles.body}>{card.body}</div>
            </article>
          );
        })}
      </div>

      <div className={styles.controls} lang={ui.language} dir={ui.dir}>
        <Button variant="tertiary" onClick={() => goTo(index - 1)} disabled={index === 0} leadingIcon={<ChevronLeftIcon />}>
          {labels.back}
        </Button>
        <p className={styles.position} id={liveId} aria-live="polite">
          {positionText(labels.position, index + 1, count)}
        </p>
        <Button variant="primary" onClick={() => goTo(index + 1)} disabled={index === count - 1}>
          {labels.next}
          <ChevronRightIcon aria-hidden />
        </Button>
      </div>
    </section>
  );
}
