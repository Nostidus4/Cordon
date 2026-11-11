// Spread plan for "simulate mode" (spec §10.3): red spreads from the compromised person along edges, on-chain first, then declared,
// one step per reached key (default 300 ms). The counter maps steps onto Bạn nghĩ -> Ước tính. Pure: no timers here.
import type { GraphSnapshot, Money, SimResult } from "../types";

export interface SpreadStep {
  index: number;
  /** ms after the animation starts */
  at: number;
  kind: "origin" | "onchain" | "declared";
  keyId?: string;
  /** node ids that turn red at this step */
  nodeIds: string[];
  /** edge ids lit red at this step (graph edges + the vault->district exposure line) */
  edgeIds: string[];
}
export interface SpreadPlan {
  steps: SpreadStep[];
  stepMs: number;
  onchainCount: number;
  declaredCount: number;
  youThink: bigint;
  enforced: bigint;
  estimated: bigint;
}

export const STEP_MS = 300;
const big = (m: Money) => BigInt(m.raw);
export const busEdgeId = (principalId: string) => `x:vault-p:${principalId}`;

export function buildSpreadPlan(sim: Pick<SimResult, "reachedKeys" | "totals">, snap: GraphSnapshot, compromised: string[], stepMs = STEP_MS): SpreadPlan {
  const keyOwner = new Map<string, string>();
  for (const d of snap.districts) for (const k of d.keys) keyOwner.set(k, d.principalId);
  const onchain = sim.reachedKeys.filter((r) => r.via.includes("onchain"));
  const declared = sim.reachedKeys.filter((r) => !r.via.includes("onchain"));
  const lit = new Set<string>();
  const steps: SpreadStep[] = [];

  const originNodes = ["vault", ...compromised.map((p) => `p:${p}`)];
  compromised.forEach((p) => lit.add(p));
  steps.push({ index: 0, at: 0, kind: "origin", nodeIds: originNodes, edgeIds: compromised.map(busEdgeId) });

  const add = (r: { key: string; via: string[] }, kind: "onchain" | "declared") => {
    const edgeIds = snap.edges
      .filter((e) => e.to === `k:${r.key}` && compromised.some((p) => e.from === `p:${p}`) && (kind === "onchain" ? e.source === "onchain" : e.source !== "onchain"))
      .map((e) => e.id);
    const nodeIds = [`k:${r.key}`];
    const owner = keyOwner.get(r.key);
    if (owner && !lit.has(owner)) { lit.add(owner); nodeIds.push(`p:${owner}`); edgeIds.push(busEdgeId(owner)); }
    const index = steps.length;
    steps.push({ index, at: index * stepMs, kind, keyId: r.key, nodeIds, edgeIds });
  };
  onchain.forEach((r) => add(r, "onchain"));
  declared.forEach((r) => add(r, "declared"));
  return {
    steps, stepMs, onchainCount: onchain.length, declaredCount: declared.length,
    youThink: big(sim.totals.youThink), enforced: big(sim.totals.enforced), estimated: big(sim.totals.estimated),
  };
}

/**
 * Counter value after `stepsDone` steps (0 = nothing revealed yet = youThink).
 * On-chain keys move youThink -> enforced, declared keys move enforced -> estimated; the last step lands exactly on estimated.
 */
export function counterAt(plan: Pick<SpreadPlan, "youThink" | "enforced" | "estimated" | "onchainCount" | "declaredCount">, stepsDone: number): bigint {
  const { youThink, enforced, estimated, onchainCount: a, declaredCount: d } = plan;
  const total = a + d;
  const done = Math.max(0, Math.min(total, stepsDone - 1)); // step 0 is the origin (no key yet)
  if (done <= 0) return youThink;
  if (done >= total) return estimated;
  if (done <= a) return youThink + ((enforced - youThink) * BigInt(done)) / BigInt(a);
  const j = done - a;
  return enforced + ((estimated - enforced) * BigInt(j)) / BigInt(d);
}

/**
 * Spread order as plain data, for any renderer (2D canvas or the 3D stage): one entry per step, on-chain keys first, then declared.
 * Entry 0 is the origin (vault + the compromised people); every later entry is one reached key (+ its district the first time).
 * `nodeIds` use graph ids (`p:<principal>`, `k:<key>`, `vault`); `edgeIds` are graph edge ids plus `x:vault-p:<principal>` exposure lines.
 */
export function spreadOrder(graph: GraphSnapshot, sim: Pick<SimResult, "reachedKeys" | "totals">, from: string[]): { nodeIds: string[]; edgeIds: string[] }[] {
  return buildSpreadPlan(sim, graph, from).steps.map((s) => ({ nodeIds: s.nodeIds, edgeIds: s.edgeIds }));
}
