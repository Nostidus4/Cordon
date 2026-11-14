import { describe, expect, it } from "vitest";
import { DAY, derivePayroll, newPayrollWorld } from "../lib/mock/payrollSim";
import { rawToBig } from "../lib/format";
import { cycleProgress, pct } from "./PayrollPanel";

const at = (day: number, mutate?: (w: ReturnType<typeof newPayrollWorld>) => void) => {
  const w = newPayrollWorld();
  w.second = Math.round(day * DAY);
  mutate?.(w);
  return derivePayroll(w);
};

describe("payroll mock month (PAYROLL.md section 8)", () => {
  it("never holds more than 40% per venue and keeps the buffer", () => {
    for (let d = 0; d <= 30; d += 0.5) {
      const s = at(d);
      for (const v of s.venues) expect(rawToBig(v.deployed.raw)).toBeLessThanOrEqual(rawToBig(v.capAmount.raw));
      if (d < 29) expect(rawToBig(s.idle.raw)).toBeGreaterThanOrEqual(rawToBig(s.bufferAmount.raw));
    }
  });
  it("vault covers the payroll after the deadline even with venue B frozen", () => {
    for (const d of [29, 29.5, 30]) {
      const s = at(d, (w) => w.frozen.add("venue_b"));
      expect(s.vaultCoversPayroll).toBe(true);
      expect(rawToBig(s.idle.raw)).toBeGreaterThanOrEqual(rawToBig(s.payrollTotal.raw));
      expect(s.killed).toBe(true);
    }
  });
  it("kill switch flips the building-facing flags", () => {
    const s = at(10, (w) => { w.killed = true; w.killReason = 1; });
    expect(s.killed).toBe(true);
    expect(s.killReason).toBe(1);
    expect(s.deployedTotal.raw).toBe("0");
  });
});

describe("panel helpers", () => {
  it("cycleProgress is clamped to the month", () => {
    const s = at(15);
    expect(cycleProgress(s).day).toBe(15);
    expect(cycleProgress({ ...s, now: s.payday + 9 * DAY }).ratio).toBe(1);
  });
  it("pct handles zero and exact halves", () => {
    expect(pct("5", "0")).toBe(0);
    expect(pct("6000000", "12000000")).toBe(50);
  });
});
