import { describe, expect, it } from "vitest";
import { POP_ORDER, T, Timeline } from "./assembly";

const ALL = ["base", "surr", ...POP_ORDER];

describe("assembly timeline", () => {
  it("pops buildings in plaza -> council -> vault -> clockwise order, ~120 ms apart", () => {
    const tl = new Timeline({ expected: ALL });
    ALL.forEach((k) => tl.markReady(k));
    tl.update(10);
    const starts = POP_ORDER.map((c) => tl.popStart(c));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeCloseTo(T.stagger, 5);
    expect(starts[0]).toBeGreaterThan(10); // after the island started rising
  });

  it("finishes within ~2.6 s when everything arrives at once (night and day)", () => {
    for (const night of [1, 0]) {
      const tl = new Timeline({ expected: ALL, night: () => night });
      ALL.forEach((k) => tl.markReady(k));
      tl.update(0);
      expect(tl.finished).toBe(true);
      expect(tl.doneAt).toBeLessThanOrEqual(2.6);
    }
  });

  it("when the last asset (a building) arrives late, it takes < 1.5 s to finish", () => {
    const tl = new Timeline({ expected: ALL });
    ALL.filter((k) => k !== "B05").forEach((k) => tl.markReady(k));
    tl.update(0);
    tl.update(5);
    tl.markReady("B05");
    tl.update(5.1);
    expect(tl.doneAt - 5.1).toBeLessThan(1.5);
  });

  it("springs 0 -> 1.08 -> 1 and hides a building until it is scheduled", () => {
    const tl = new Timeline({ expected: ["base", "B01"] });
    expect(tl.pop("B01", 0).visible).toBe(false);
    tl.markReady("base");
    tl.markReady("B01");
    tl.update(0);
    const at = tl.popStart("B01");
    let peak = 0;
    for (let t = at; t <= at + T.pop; t += 0.01) peak = Math.max(peak, tl.pop("B01", t).sy);
    expect(peak).toBeCloseTo(1.08, 2);
    expect(tl.pop("B01", at + T.pop + 0.1).sy).toBeCloseTo(1, 5);
  });

  it("waits for the base before popping, and never blocks forever (deadline)", () => {
    const tl = new Timeline({ expected: ALL });
    tl.markReady("B01");
    tl.update(0);
    expect(tl.popStart("B01")).toBe(-1);
    tl.update(T.deadline + 1);
    expect(tl.baseAt).toBeGreaterThan(0);
    expect(tl.finished).toBe(true);
  });

  it("reduced motion: no animation, everything in place at once", () => {
    const tl = new Timeline({ expected: ALL, reduced: true });
    ALL.forEach((k) => tl.markReady(k));
    tl.update(5);
    expect(tl.pop("B03", 5).sy).toBe(1);
    expect(tl.island(5)).toBe(1);
    expect(tl.doneAt).toBeLessThanOrEqual(5.3 + 1e-9);
  });

  it("lights: night cascades quickly with overshoot, day sweeps softly; building order staggers", () => {
    const night = new Timeline({ expected: ALL, night: () => 1 });
    ALL.forEach((k) => night.markReady(k));
    night.update(0);
    const L = night.lightsAt;
    expect(night.lit(0, L - 0.01)).toBe(0);
    expect(night.lit(0, L + 0.17)).toBeGreaterThan(1);
    expect(night.lit(0, L + 1)).toBeCloseTo(1, 5);
    expect(night.lit(5, L + 0.1)).toBe(0); // later buildings light later
    const day = new Timeline({ expected: ALL, night: () => 0 });
    ALL.forEach((k) => day.markReady(k));
    day.update(0);
    for (let t = day.lightsAt; t < day.lightsAt + 2; t += 0.05) expect(day.lit(0, t)).toBeLessThanOrEqual(1);
  });
});
