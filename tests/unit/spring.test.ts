import { describe, expect, it } from "vitest";
import { SPRING_DEFAULT, SPRING_FLICK, isSettled, project, rubberband, settleIndex, stepSpring, velocityFrom } from "@/lib/ui/spring";

function run(params: typeof SPRING_DEFAULT, from = 0, target = 1, v = 0, seconds = 2) {
  let s = { x: from, v };
  let max = from;
  for (let t = 0; t < seconds; t += 1 / 60) {
    s = stepSpring(s, target, 1 / 60, params);
    max = Math.max(max, s.x);
  }
  return { s, max };
}

describe("springs (apple-design §4)", () => {
  it("critically damped settles without overshoot", () => {
    const { s, max } = run(SPRING_DEFAULT);
    expect(isSettled(s, 1)).toBe(true);
    expect(max).toBeLessThanOrEqual(1.0005);
  });
  it("flick spring overshoots a little, then settles", () => {
    const { s, max } = run(SPRING_FLICK);
    expect(max).toBeGreaterThan(1.001);
    expect(isSettled(s, 1)).toBe(true);
  });
  it("carries an initial velocity (velocity handoff, §5)", () => {
    const moving = stepSpring({ x: 0, v: 5 }, 0, 1 / 60, SPRING_DEFAULT);
    expect(moving.x).toBeGreaterThan(0);
  });
  it("stays stable at a low frame rate", () => {
    const s = stepSpring({ x: 0, v: 0 }, 1, 0.25, SPRING_DEFAULT);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(s.x).toBeLessThan(1.5);
  });
});

describe("gesture maths", () => {
  it("projects further for faster releases", () => {
    expect(project(2)).toBeGreaterThan(project(1));
    expect(project(-1)).toBeLessThan(0);
  });
  it("rubber-bands progressively", () => {
    const a = rubberband(50, 300);
    const b = rubberband(200, 300);
    expect(a).toBeLessThan(50);
    expect(b - a).toBeLessThan(150);
  });
  it("settles on the nearest card, at most one away from the start", () => {
    expect(settleIndex(0.3, 0, 0, 5)).toBe(0);
    expect(settleIndex(0.6, 0, 0, 5)).toBe(1);
    expect(settleIndex(0.2, 2, 0, 5)).toBe(1); // a flick carries it over
    expect(settleIndex(0.2, 50, 0, 5)).toBe(1); // never skips cards
    expect(settleIndex(-0.4, -3, 0, 5)).toBe(0); // clamped at the first card
    expect(settleIndex(3.8, 3, 4, 5)).toBe(4); // and at the last
  });
  it("measures velocity over the recent window", () => {
    expect(velocityFrom([{ t: 0, x: 0 }, { t: 50, x: 10 }, { t: 100, x: 20 }])).toBeCloseTo(200);
    expect(velocityFrom([{ t: 0, x: 0 }])).toBe(0);
  });
});
