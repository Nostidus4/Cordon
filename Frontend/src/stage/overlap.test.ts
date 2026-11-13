import { describe, expect, it } from "vitest";
import { intersectingPairs, type SlotRect } from "./overlap";

const r = (slot: string, left: number, top: number, right: number, bottom: number): SlotRect => ({ slot, left, top, right, bottom });

describe("intersectingPairs", () => {
  it("finds overlapping slots and ignores touching edges", () => {
    expect(intersectingPairs([r("a", 0, 0, 100, 100), r("b", 50, 50, 150, 150)])).toEqual([["a", "b"]]);
    expect(intersectingPairs([r("a", 0, 0, 100, 100), r("b", 100, 0, 200, 100)])).toEqual([]);
    expect(intersectingPairs([r("a", 0, 0, 100, 100), r("b", 0, 100, 100, 200)])).toEqual([]);
  });
  it("ignores the full-screen end card", () => {
    expect(intersectingPairs([r("end-card", 0, 0, 1000, 800), r("drawer", 600, 70, 980, 600)])).toEqual([]);
  });
});
