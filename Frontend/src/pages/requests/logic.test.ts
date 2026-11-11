import { describe, expect, it } from "vitest";
import { isRiskIncrease, approvalSlots, beforeAfter, canReachThreshold, canonicalReport, conflictReason, deltaOf, deltaTone, hashReport, pctOfTreasury } from "./logic";
import { money, toBase } from "../../lib/format";
import type { Proposal, RiskReport, SimTotals } from "../../types";

const totals = (enforced: number, estimated: number): SimTotals => ({
  youThink: money(toBase(20000)), enforced: money(toBase(enforced)), estimated: money(toBase(estimated)), vaultBalance: money(toBase(200000)), percentOfMainTreasury: 0,
});
const report = (b: [number, number], a: [number, number]): RiskReport => ({
  before: totals(...b), after: totals(...a), findingsBefore: [], findingsAfter: [], conflictOfInterest: false, generatedAt: "2026-01-01T00:00:00Z", graphVersion: 1,
});
const prop = (over: Partial<Proposal> = {}): Proposal => ({
  id: 13, title: "t", subjectPrincipal: "huy", change: { kind: "move_key", key: "key_agent_rebalance", toPrincipal: "huy" }, calls: [], describe: [],
  riskReport: report([40000, 40000], [60000, 60000]), riskReportHash: "0x00", conflictedMembers: [], warnings: [], proposer: "trang", approvals: [], threshold: 2, status: "open",
  createdAt: "", executedAt: null, resultingPolicyVersion: null, ...over,
});

describe("before/after formatting", () => {
  it("request #12: Enforced 30.000 -> 130.000, 1,5% -> 6,5%", () => {
    const { enforced } = beforeAfter({ riskReport: report([30000, 30000], [130000, 130000]) });
    expect(enforced.beforeDisplay).toBe("30.000");
    expect(enforced.afterDisplay).toBe("130.000");
    expect(enforced.beforePctText).toBe("1,5%");
    expect(enforced.afterPctText).toBe("6,5%");
    expect(enforced.delta).toEqual({ dir: "up", abs: toBase(100000), text: "+100.000" });
    expect(deltaTone(enforced.delta)).toBe("bad");
  });
  it("merge proposal: Estimated 100.000 -> 30.000 is a reduction (ok)", () => {
    const { estimated } = beforeAfter({ riskReport: report([20000, 100000], [30000, 30000]) });
    expect(estimated.beforePctText).toBe("5%");
    expect(estimated.afterPctText).toBe("1,5%");
    expect(estimated.delta.text).toBe("−70.000");
    expect(deltaTone(estimated.delta)).toBe("ok");
  });
  it("same value is neutral; percent uses the supplied treasury", () => {
    expect(deltaOf(5n, 5n).dir).toBe("same");
    expect(pctOfTreasury(toBase(10000), toBase(100000))).toBe(10);
  });
});

describe("merge story: closing the blind gap", () => {
  it("Estimated 100k->30k is teal; Enforced 20k->30k is neutral; gap 80.000 -> 0", () => {
    const r = beforeAfter({ riskReport: report([20000, 100000], [30000, 30000]) });
    expect(r.estimated.tone).toBe("ok");
    expect(r.enforced.tone).toBe("muted");
    expect(r.gap).toMatchObject({ beforeDisplay: "80.000", afterDisplay: "0", closes: true, visible: true });
  });
  it("pure loosening (#12) stays red and has no gap", () => {
    const r = beforeAfter({ riskReport: report([30000, 30000], [130000, 130000]) });
    expect(r.enforced.tone).toBe("bad");
    expect(r.estimated.tone).toBe("bad");
    expect(r.gap.visible).toBe(false);
  });
});

describe("risk direction", () => {
  it("merge (Enforced 20k->30k, Estimated 100k->30k) is a reduction, #12 (30k->130k) is an increase", () => {
    expect(isRiskIncrease({ riskReport: report([20000, 100000], [30000, 30000]) })).toBe(false);
    expect(isRiskIncrease({ riskReport: report([30000, 30000], [130000, 130000]) })).toBe(true);
  });
});

describe("approval slots & conflict of interest", () => {
  it("disables the conflicted member's button with the reason, others stay enabled", () => {
    const slots = approvalSlots(prop({ conflictedMembers: ["huy"] }));
    const huy = slots.find((s) => s.member === "huy")!;
    expect(huy.canApprove).toBe(false);
    expect(huy.state).toBe("conflict");
    expect(huy.disabledReason).toBe(conflictReason("Anh Huy"));
    expect(huy.disabledReason).toContain("ConflictOfInterest()");
    expect(slots.filter((s) => s.member !== "huy").every((s) => s.canApprove)).toBe(true);
  });
  it("already approved members cannot approve twice", () => {
    const slots = approvalSlots(prop({ approvals: [{ member: "lan", at: "x" }] }));
    expect(slots.find((s) => s.member === "lan")).toMatchObject({ state: "approved", canApprove: false });
    expect(slots.find((s) => s.member === "trang")!.canApprove).toBe(true);
  });
  it("executed proposals disable everyone", () => {
    expect(approvalSlots(prop({ status: "executed" })).every((s) => !s.canApprove)).toBe(true);
  });
  it("threshold stays reachable with one conflicted member (2 of 3 left)", () => {
    expect(canReachThreshold(prop({ conflictedMembers: ["huy"] }))).toBe(true);
    expect(canReachThreshold(prop({ conflictedMembers: ["huy", "lan"] }))).toBe(false);
  });
});

describe("risk report hash", () => {
  it("is stable, ignores generatedAt, changes with the numbers", async () => {
    const a = report([1, 2], [3, 4]);
    const b = { ...a, generatedAt: "2030-01-01T00:00:00Z" };
    const c = report([1, 2], [3, 5]);
    expect(canonicalReport(a)).toBe(canonicalReport(b));
    const [ha, hb, hc] = await Promise.all([hashReport(a), hashReport(b), hashReport(c)]);
    expect(ha).toMatch(/^0x[0-9a-f]{64}$/);
    expect(ha).toBe(hb);
    expect(ha).not.toBe(hc);
  });
});
