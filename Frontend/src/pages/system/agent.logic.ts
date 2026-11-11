// Pure helpers of the AgentRebalance section (spec §7.1): amountIn = min(gap, key left, district left, 5.000).
import type { AgentRun, AgentRunInputs, Money } from "../../types";

export type TermId = "gap" | "key" | "district" | "max";
export interface Term { id: TermId; label: string; value: Money }

export function amountTerms(i: AgentRunInputs): Term[] {
  return [
    { id: "gap", label: "phần thiếu", value: i.shortfall },
    { id: "key", label: "còn lại của thẻ", value: i.keyRemaining },
    { id: "district", label: "còn lại của khu", value: i.districtRemaining },
    { id: "max", label: "trần mỗi lần", value: i.maxPerRun },
  ];
}
/** The smallest term (first one wins on ties) and the resulting amountIn. */
export function computeAmountIn(i: AgentRunInputs): { terms: Term[]; winner: Term; amountRaw: bigint } {
  const terms = amountTerms(i);
  const winner = terms.reduce((m, t) => (BigInt(t.value.raw) < BigInt(m.value.raw) ? t : m), terms[0]);
  return { terms, winner, amountRaw: BigInt(winner.value.raw) };
}
/** Drift of tTKB below target, in percentage points (positive = under target). */
export const driftOf = (r: AgentRun): number => Math.round((r.decision.targetShare - r.decision.tTKBShareBefore) * 10) / 10;
export const needsRebalance = (r: AgentRun, threshold: number): boolean => driftOf(r) > threshold;

export type Verdict = { kind: "swapped"; tone: "ok" } | { kind: "blocked"; tone: "bad" } | { kind: "noop"; tone: "grey" };
export const verdictOf = (r: AgentRun): Verdict => (r.outcome === "ok" ? { kind: "swapped", tone: "ok" } : r.outcome === "blocked" ? { kind: "blocked", tone: "bad" } : { kind: "noop", tone: "grey" });
/** Does the amount the agent sent equal the rule-engine minimum? (A mismatch would mean the backend deviated from §7.1.) */
export function amountConsistent(r: AgentRun): boolean | null {
  if (!r.inputs || !r.decision.amountIn) return null;
  return BigInt(r.decision.amountIn.raw) === computeAmountIn(r.inputs).amountRaw;
}
