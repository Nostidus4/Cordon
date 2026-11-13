import { describe, expect, it } from "vitest";
import { amountConsistent, computeAmountIn, driftOf, needsRebalance, verdictOf } from "./agent.logic";
import { money, toBase } from "../../lib/format";
import type { AgentRun } from "../../types";

const m = (n: number) => money(toBase(n));
const run = (o: Partial<AgentRun> & { s?: number; k?: number; d?: number | null } = {}): AgentRun => {
  const { s, k, d, ...rest } = o;
  return {
    id: 1, ts: 1_794_000_000, outcome: "swapped", reasonText: "", reasonSource: "template", reasonHash: null, txHash: null, reasonCode: null, attemptId: null, steps: null, untrustedInput: null, injectionIgnored: null,
    decision: { tokenIn: "tUSDC", tokenOut: "tTKB", amountIn: m(5000), gap: m(s ?? 20000), ttkbWeightBps: 0, targetBps: 2000, totalValue: m(100000) },
    balances: { vaultTusdc: m(100000), vaultTtkb: m(0), ttkbValueInTusdc: m(0), keyRemaining: m(k ?? 20000), districtRemaining: d === null ? null : m(d ?? 30000) },
    ...rest,
  };
};

describe("computeAmountIn", () => {
  it("is capped by the 5.000 per-run ceiling when everything else is larger", () => {
    const r = computeAmountIn(run())!;
    expect(r.winner.id).toBe("max");
    expect(r.amountRaw).toBe(toBase(5000));
  });
  it("is limited by the key's remaining allowance", () => { expect(computeAmountIn(run({ k: 1200 }))!.winner.id).toBe("key"); });
  it("is limited by the district remainder and by a small gap", () => {
    expect(computeAmountIn(run({ d: 800 }))!.winner.id).toBe("district");
    expect(computeAmountIn(run({ s: 300 }))!.amountRaw).toBe(toBase(300));
  });
  it("is null without a decision", () => { expect(computeAmountIn(run({ decision: null }))).toBeNull(); });
});
describe("drift and verdict", () => {
  it("drifts 20 points under target", () => { const r = run(); expect(driftOf(r)).toBe(20); expect(needsRebalance(r, 5)).toBe(true); });
  it("does not rebalance inside the threshold", () => { expect(needsRebalance(run({ decision: { ...run().decision!, ttkbWeightBps: 1700 } }), 5)).toBe(false); });
  it("maps outcomes", () => { expect([verdictOf(run()).kind, verdictOf(run({ outcome: "blocked" })).kind, verdictOf(run({ outcome: "no_action" })).kind]).toEqual(["swapped", "blocked", "noop"]); });
  it("detects an amount that deviates from the rule engine", () => {
    expect(amountConsistent(run())).toBe(true);
    expect(amountConsistent(run({ decision: { ...run().decision!, amountIn: m(4000) } }))).toBe(false);
    expect(amountConsistent(run({ decision: null }))).toBeNull();
  });
});
