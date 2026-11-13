// Derived (UI-only) values for backend DTOs that carry only raw fields: no fake fields on the wire types.
import type { Attempt, ChainEvent } from "../types";

/** Stable key of an indexed event (the backend has no event id). */
export const eventKey = (e: Pick<ChainEvent, "txHash" | "logIndex">): string => `${e.txHash}:${e.logIndex}`;

/** Council member for an event payload value: live events carry the member's address, the mock/tests may carry the id. */
export const memberOf = <M extends { id: string; address: string }>(members: readonly M[], v: unknown): M | undefined =>
  typeof v === "string" ? members.find((m) => m.id === v || m.address.toLowerCase() === v.toLowerCase()) : undefined;
export const isoOfSec = (sec: number): string => new Date(sec * 1000).toISOString();

/** Scene-4 step of an attempt. The agent's morning swap (run-once) is the backend's `step: null, source: "agent"` row = step 0. */
export const stepOf = (a: Pick<Attempt, "step">): number => a.step ?? 0;

/** Attempt order inside a run: by step, falling back to id. */
export const byStep = (x: Attempt, y: Attempt): number => stepOf(x) - stepOf(y) || x.id - y.id;

/**
 * Attempts of the newest scenario run (+ the agent's own rows, which carry no run id), from the REST list and rows the stream
 * delivered meanwhile. Newest run = run id of the last attempt that has one.
 */
export function liveRunAttempts(base: Attempt[], streamed: Attempt[]): Attempt[] {
  const all = [...base, ...streamed.filter((s) => !base.some((b) => b.id === s.id))];
  const run = [...all].reverse().find((a) => a.scenarioRunId)?.scenarioRunId;
  return all.filter((a) => !run || a.scenarioRunId === run || a.source === "agent");
}

/** Clock label of an attempt: scene time when scripted, else the wall clock of its timestamp (agent rows have none). */
export const timeOf = (a: Pick<Attempt, "displayTime" | "ts">): string =>
  a.displayTime ?? new Date(a.ts * 1000).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });

/** One-line VI description of what the attempt tried (the backend sends action kind + token/to/amount). */
export function attemptLabel(a: Attempt): string {
  const amt = a.amount ? `${a.amount.display} ${a.token ?? ""}`.trim() : (a.token ?? "");
  const dest = a.toLabel ?? a.to ?? "";
  switch (a.action) {
    case "pay": return `Trả ${amt} → ${dest}`;
    case "swap": return `Swap ${amt}${a.toLabel || a.to ? ` qua ${dest}` : ""}`;
    case "lock": return `${a.signerLabel} khoá khu ${a.principalId ?? ""}`.trim();
    case "approve": return `Gọi ${a.token ?? "token"}.approve`;
    default: return `Gọi trực tiếp ${a.token ?? "contract khác"}`;
  }
}
