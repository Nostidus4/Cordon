// View-model of the right pane. Every number comes from an attempt/event field; nothing is summed on the client (spec §10.5).
import type { Attempt } from "../../types";
import { byStep, stepOf } from "../../lib/dto";
import { KEY_ORDER, type KeyMeta } from "./leftSimulation";

export type TileStatus = "idle" | "ok" | "blocked" | "locked";
export interface Tile { meta: KeyMeta; last: Attempt | null; status: TileStatus; /** step-7 attempt on this card, if any */ rejected: Attempt | null }
export interface IncidentView {
  attempts: Attempt[];
  tiles: Tile[];
  /** latest `principalSpentAfter` seen (bigint base units) or null */
  sharedSpent: bigint | null;
  /** `principalSpentAfter` of step 0 (agent's morning swap) */
  agentBase: bigint;
  /** difference of two event values: what the attacker got out (sharedSpent - agentBase) */
  attackerSpent: bigint;
  /** newest attempt rejected for DISTRICT_DAILY_CAP: drawn as the ghost "would-be" segment */
  ghost: Attempt | null;
  lockAttempt: Attempt | null;
  step7: Attempt | null;
  lastAttempt: Attempt | null;
  maxStep: number;
  locked: boolean;
  attackDone: boolean;
}

export const sortAttempts = (a: Attempt[]) => [...a].sort(byStep);

export function deriveView(raw: Attempt[], districtLocked: boolean): IncidentView {
  const attempts = sortAttempts(raw);
  const lockAttempt = attempts.find((a) => a.action === "lock" && a.outcome === "ok") ?? null;
  const locked = districtLocked || !!lockAttempt;
  const step7 = [...attempts].reverse().find((a) => stepOf(a) === 7) ?? null;
  let sharedSpent: bigint | null = null;
  for (const a of attempts) if (a.principalSpentAfter) sharedSpent = BigInt(a.principalSpentAfter.raw);
  const step0 = attempts.find((a) => stepOf(a) === 0 && a.principalSpentAfter);
  const agentBase = step0?.principalSpentAfter ? BigInt(step0.principalSpentAfter.raw) : 0n;
  const attackerSpent = sharedSpent !== null && sharedSpent > agentBase ? sharedSpent - agentBase : 0n;
  const ghost = [...attempts].reverse().find((a) => a.reasonCode === "DISTRICT_DAILY_CAP" && a.amount) ?? null;
  const tiles: Tile[] = KEY_ORDER.map((meta) => {
    const mine = attempts.filter((a) => a.signer === meta.id);
    const last = mine.length ? mine[mine.length - 1] : null;
    const rejected = mine.find((a) => stepOf(a) === 7) ?? null;
    const status: TileStatus = locked ? "locked" : !last ? "idle" : last.outcome === "ok" ? "ok" : "blocked";
    return { meta, last, status, rejected };
  });
  return {
    attempts, tiles, sharedSpent, agentBase, attackerSpent, ghost, lockAttempt, step7, locked,
    lastAttempt: attempts.length ? attempts[attempts.length - 1] : null,
    maxStep: attempts.reduce((m, a) => Math.max(m, stepOf(a)), -1),
    attackDone: attempts.some((a) => stepOf(a) >= 5),
  };
}

export const toDisp = (b: bigint | null | undefined): number => (b == null ? 0 : Number(b / 1_000_000n));
