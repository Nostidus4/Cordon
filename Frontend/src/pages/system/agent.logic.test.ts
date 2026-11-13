import { describe, expect, it } from "vitest";
import { amountConsistent, computeAmountIn, driftOf, needsRebalance, verdictOf } from "./agent.logic";
import { money, toBase } from "../../lib/format";
import type { AgentRun, AgentRunInputs } from "../../types";

const m = (n: number) => money(toBase(n));
const inputs = (p: Partial<Record<"s" | "k" | "d" | "x", number>> = {}): AgentRunInputs => ({
  vaultUsdc: m(100000), vaultTkb: m(0), driftThreshold: 5, shortfall: m(p.s ?? 20000), maxPerRun: m(p.x ?? 5000), keyRemaining: m(p.k ?? 20000), districtRemaining: m(p.d ?? 30000),
});
const run = (o: Partial<AgentRun>): AgentRun => ({
  id: "r", decision: { action: "swap", tokenIn: "tUSDC", tokenOut: "tTKB", amountIn: m(5000), tTKBShareBefore: 0, targetShare: 20 }, reasonText: "", reasonSource: "template", reasonHash: null, txHash: null, simulated: true,
  outcome: "ok", reasonCode: null, createdAt: "", inputs: inputs(), reasonHashOnChain: null, reasonHashVerified: null, rejectedReasonText: null, ...o,
});

describe("computeAmountIn", () => {
  it("is capped by the 5.000 per-run ceiling when everything else is larger", () => {
    const r = computeAmountIn(inputs());
    expect(r.winner.id).toBe("max");
    expect(r.amountRaw).toBe(toBase(5000));
  });
  it("is limited by the key's remaining allowance", () => { expect(computeAmountIn(inputs({ k: 1200 })).winner.id).toBe("key"); });
  it("is limited by the district remainder and by a small gap", () => {
    expect(computeAmountIn(inputs({ d: 800 })).winner.id).toBe("district");
    expect(computeAmountIn(inputs({ s: 300 })).amountRaw).toBe(toBase(300));
  });
});
describe("drift and verdict", () => {
  it("drifts 20 points under target", () => { const r = run({}); expect(driftOf(r)).toBe(20); expect(needsRebalance(r, 5)).toBe(true); });
  it("does not rebalance inside the threshold", () => { expect(needsRebalance(run({ decision: { ...run({}).decision, tTKBShareBefore: 17 } }), 5)).toBe(false); });
  it("maps outcomes", () => { expect([verdictOf(run({})).kind, verdictOf(run({ outcome: "blocked" })).kind, verdictOf(run({ outcome: "noop" })).kind]).toEqual(["swapped", "blocked", "noop"]); });
  it("detects an amount that deviates from the rule engine", () => {
    expect(amountConsistent(run({}))).toBe(true);
    expect(amountConsistent(run({ decision: { ...run({}).decision, amountIn: m(4000) } }))).toBe(false);
    expect(amountConsistent(run({ inputs: undefined }))).toBeNull();
  });
});
