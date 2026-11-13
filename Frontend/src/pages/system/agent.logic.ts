// Pure helpers of the AgentRebalance section (spec §7.1): amountIn = min(gap, key left, vault tUSDC, district left, 5.000).
import type { AgentRun, Money } from "../../types";

/** Rule-engine constants (backend agent_rebalance/config.py): drift threshold in percentage points, per-run ceiling. */
export const DRIFT_THRESHOLD = 5;
export const MAX_PER_RUN: Money = { raw: "5000000000", display: "5.000" };

export type TermId = "gap" | "key" | "vault" | "district" | "max";
export interface Term { id: TermId; label: string; value: Money }

/** The terms of the min() for a run that made a decision (the district term only exists when the key's district has a cap). */
export function amountTerms(r: AgentRun): Term[] {
  const b = r.balances;
  const terms: Term[] = [
    { id: "gap", label: "phần thiếu", value: r.decision!.gap },
    { id: "key", label: "còn lại của thẻ", value: b.keyRemaining },
    { id: "vault", label: "tUSDC trong kho", value: b.vaultTusdc },
  ];
  if (b.districtRemaining) terms.push({ id: "district", label: "còn lại của khu", value: b.districtRemaining });
  terms.push({ id: "max", label: "trần mỗi lần", value: MAX_PER_RUN });
  return terms;
}
/** The smallest term (first one wins on ties) and the resulting amountIn; null when the run made no decision. */
export function computeAmountIn(r: AgentRun): { terms: Term[]; winner: Term; amountRaw: bigint } | null {
  if (!r.decision) return null;
  const terms = amountTerms(r);
  const winner = terms.reduce((m, t) => (BigInt(t.value.raw) < BigInt(m.value.raw) ? t : m), terms[0]);
  return { terms, winner, amountRaw: BigInt(winner.value.raw) };
}
/** tTKB share and target in percent (from basis points); null when the run made no decision. */
export const sharesOf = (r: AgentRun): { share: number; target: number } | null => (r.decision ? { share: r.decision.ttkbWeightBps / 100, target: r.decision.targetBps / 100 } : null);
/** Drift of tTKB below target, in percentage points (positive = under target). */
export const driftOf = (r: AgentRun): number => (r.decision ? Math.round(r.decision.targetBps - r.decision.ttkbWeightBps) / 100 : 0);
export const needsRebalance = (r: AgentRun, threshold: number): boolean => driftOf(r) > threshold;

export type Verdict = { kind: "swapped"; tone: "ok" } | { kind: "blocked"; tone: "bad" } | { kind: "noop"; tone: "grey" };
/** swapped = sent and ok; blocked/reverted = refused (simulate) or rejected on chain; no_action = nothing to do. */
export const verdictOf = (r: AgentRun): Verdict => (r.outcome === "swapped" ? { kind: "swapped", tone: "ok" } : r.outcome === "blocked" || r.outcome === "reverted" ? { kind: "blocked", tone: "bad" } : { kind: "noop", tone: "grey" });
/** Does the amount the agent sent equal the rule-engine minimum? (A mismatch would mean the backend deviated from §7.1.) */
export function amountConsistent(r: AgentRun): boolean | null {
  const c = r.outcome === "swapped" ? computeAmountIn(r) : null; // a refused run falls back to the ceiling amount
  return c ? BigInt(r.decision!.amountIn.raw) === c.amountRaw : null;
}
