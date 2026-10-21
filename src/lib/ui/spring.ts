/**
 * Small spring + gesture maths for touch-driven UI (apple-design skill §4-§6, §9).
 * Springs are described with Apple's two parameters: damping ratio and response (seconds).
 * Pure functions only, so they are unit-testable and framework-free.
 */

export type SpringParams = { damping: number; response: number };
export type SpringState = { x: number; v: number };

/** Critically damped default; a little bounce only after a flick (momentum). */
export const SPRING_DEFAULT: SpringParams = { damping: 1, response: 0.35 };
export const SPRING_FLICK: SpringParams = { damping: 0.8, response: 0.35 };

/** One semi-implicit Euler step towards `target`. `dt` in seconds; sub-steps keep it stable at low frame rates. */
export function stepSpring(s: SpringState, target: number, dt: number, p: SpringParams): SpringState {
  const omega = (2 * Math.PI) / p.response;
  const k = omega * omega;
  const c = 2 * p.damping * omega;
  let { x, v } = s;
  const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    v += (-k * (x - target) - c * v) * h;
    x += v * h;
  }
  return { x, v };
}

export function isSettled(s: SpringState, target: number, eps = 0.001): boolean {
  return Math.abs(s.x - target) < eps && Math.abs(s.v) < eps * 10;
}

/** Apple's momentum projection: how far a release velocity (units/s) carries. */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Progressive resistance past a boundary. `overshoot` and `dimension` in the same units. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/**
 * Card to settle on after a swipe, in card-index units. Projects the release velocity, then
 * snaps to the nearest card, moving at most one card from where the drag started.
 */
export function settleIndex(position: number, velocity: number, startIndex: number, count: number): number {
  const projected = position + project(velocity);
  const nearest = Math.round(projected);
  const limited = Math.min(startIndex + 1, Math.max(startIndex - 1, nearest));
  return Math.min(count - 1, Math.max(0, limited));
}

/** Velocity (units/s) from the last ~100ms of pointer samples. */
export function velocityFrom(samples: { t: number; x: number }[], windowMs = 100): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  const first = samples.find((s) => last.t - s.t <= windowMs) ?? samples[0];
  const dt = (last.t - first.t) / 1000;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}
