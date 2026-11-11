// Pure helpers of the Simulation section: the §8.4 reference table and matching it against a live result.
import type { ProposedChange, SimResult } from "../../types";
import { toBase } from "../../lib/format";

export interface RefRow { id: string; policy: 1 | 2; label: string; picked: string[]; changeCap: number | null; youThink: number; enforced: number; estimated: number }
/** Spec §8.4 "Số mong đợi với seed". */
export const REFERENCE: RefRow[] = [
  { id: "v1-minh", policy: 1, label: "policy v1", picked: ["minh"], changeCap: null, youThink: 20_000, enforced: 20_000, estimated: 100_000 },
  { id: "v1-minh-huy", policy: 1, label: "policy v1", picked: ["minh", "huy"], changeCap: null, youThink: 60_000, enforced: 60_000, estimated: 140_000 },
  { id: "v2-minh", policy: 2, label: "policy v2", picked: ["minh"], changeCap: null, youThink: 30_000, enforced: 30_000, estimated: 30_000 },
  { id: "v2-12-minh", policy: 2, label: "v2 + đơn #12 (cap 130.000)", picked: ["minh"], changeCap: 130_000, youThink: 130_000, enforced: 130_000, estimated: 130_000 },
];

export type RefMatch = "match" | "mismatch" | "other";
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join();
export const changeCapOf = (c: ProposedChange | undefined): number | null => (c?.kind === "raise_cap" ? Number(BigInt(c.newCapRaw) / toBase(1)) : null);

/** `other` also when the state is no longer the seed (spent / locked). `match`: same scenario and every number equal; `mismatch`: same scenario but numbers differ; `other`: not the scenario being viewed. */
export function matchReference(row: RefRow, ctx: { policyVersion: number; compromised: string[]; change?: ProposedChange; /** false when a picked district already spent money today or is locked: the seed table no longer applies */ pristine?: boolean }, result: SimResult | undefined): RefMatch {
  if (!result || ctx.pristine === false) return "other";
  const hasChange = changeCapOf(ctx.change);
  if (row.policy !== ctx.policyVersion || !sameSet(row.picked, ctx.compromised) || row.changeCap !== hasChange) return "other";
  const t = result.totals;
  const ok = (["youThink", "enforced", "estimated"] as const).every((k) => BigInt(t[k].raw) === toBase(row[k]));
  return ok ? "match" : "mismatch";
}

/** Preset "change" options of the runner: every open proposal's change, plus request #12 when the mock/backend has not listed it. */
export interface Preset { id: string; label: string; change: ProposedChange }
export function presetsFrom(proposals: { id: number; status: string; title: string; change: ProposedChange }[] | undefined): Preset[] {
  return (proposals ?? []).filter((p) => p.status === "open").map((p) => ({ id: `p${p.id}`, label: `Đơn #${p.id}: ${p.title}`, change: p.change }));
}
