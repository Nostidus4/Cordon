import { describe, expect, it } from "vitest";
import { fmtDaily, fmtDisplay, fmtPercent, money, percentOf, toBase } from "./format";

describe("format", () => {
  it("formats 30000000000 base units as 30.000", () => {
    expect(fmtDisplay(30_000_000_000n)).toBe("30.000");
    expect(money(200_000_000_000n)).toEqual({ raw: "200000000000", display: "200.000" });
  });
  it("handles zero, small, fractions and negatives", () => {
    expect(fmtDisplay(0n)).toBe("0");
    expect(fmtDisplay(999n * 1_000_000n)).toBe("999");
    expect(fmtDisplay(1_500_000n)).toBe("1,5");
    expect(fmtDisplay(1_234_567_000_000n)).toBe("1.234.567");
    expect(fmtDisplay(-5_000_000n)).toBe("-5");
  });
  it("percent uses comma and daily suffix", () => {
    expect(fmtPercent(6.5)).toBe("6,5%");
    expect(fmtPercent(5)).toBe("5%");
    expect(fmtDaily("30.000")).toBe("30.000/ngày");
    expect(percentOf(toBase(130_000), toBase(2_000_000))).toBe(6.5);
  });
});
