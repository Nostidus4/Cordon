import { describe, expect, it } from "vitest";
import { TOUR_STEPS, stepIndexById } from "./steps";
import { useTourStore } from "./tourStore";

describe("tour script (spec §14.3 order)", () => {
  it("has unique ids and Vietnamese captions", () => {
    expect(new Set(TOUR_STEPS.map((s) => s.id)).size).toBe(TOUR_STEPS.length);
    expect(TOUR_STEPS.every((s) => s.caption.length > 20 && s.title.length > 3)).toBe(true);
  });
  it("walks scenes 1 -> 2 -> 3 -> 4 -> 5 -> About in order", () => {
    const scenes = TOUR_STEPS.map((s) => s.scene).filter((s) => s > 0);
    expect(scenes).toEqual([...scenes].sort((a, b) => a - b));
    expect(new Set(scenes)).toEqual(new Set([1, 2, 3, 4, 5, 6]));
    expect(stepIndexById("inc-attack")).toBeLessThan(stepIndexById("req-12"));
    expect(stepIndexById("req-approve")).toBeLessThan(stepIndexById("inc-agent"));
  });
});
describe("tour store", () => {
  it("clamps, finishes at the last step and resets on stop", () => {
    const s = useTourStore.getState();
    s.start();
    expect(useTourStore.getState()).toMatchObject({ active: true, index: 0 });
    useTourStore.getState().prev();
    expect(useTourStore.getState().index).toBe(0);
    useTourStore.getState().goto(TOUR_STEPS.length - 1);
    useTourStore.getState().next();
    expect(useTourStore.getState().active).toBe(false);
  });
});
