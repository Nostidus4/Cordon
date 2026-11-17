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
describe("tour targets and routes (the tour runs on /he-thong)", () => {
  const sources = Object.values(import.meta.glob("../pages/system/**/*.tsx", { query: "?raw", import: "default", eager: true }) as Record<string, string>).join("\n");
  it("every static route lives under /he-thong (or is a resolver)", () => {
    for (const s of TOUR_STEPS) if (typeof s.route === "string") expect(s.route, s.id).toMatch(/^\/he-thong(\/|$|\?)/);
  });
  it("every data-tour target exists in src/pages/system", () => {
    const names = new Set(TOUR_STEPS.flatMap((s) => s.target ?? []));
    expect(names.size).toBeGreaterThan(10);
    // plain data-tour="x", or an expression such as data-tour={dim ? undefined : "x"} / data-tour={`sys-approve-${s.member}`}
    const has = (n: string) => new RegExp(`data-tour=\\{?[^\\n]*?["\`]${n.replace(/-(lan|trang|huy)$/, "-")}`).test(sources);
    for (const n of names) expect(has(n), n).toBe(true);
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
