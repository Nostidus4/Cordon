// Pure helpers of the Assistant section (spec §9.4): verification summary of one log.
import type { AssistantLog } from "../../types";

export interface LogSummary { total: number; verified: number; failed: number; uncovered: number; fallback: boolean; allOk: boolean }
export function summarizeLog(l: AssistantLog): LogSummary {
  const verified = l.checks.filter((c) => c.match).length;
  const fallback = l.toolCalls.length === 0 && l.answer.numbers.length === 0;
  return { total: l.checks.length, verified, failed: l.checks.length - verified, uncovered: l.uncovered.length, fallback, allOk: l.numbersVerified && verified === l.checks.length && l.uncovered.length === 0 };
}
/** Number-check of a given `numbers[]` entry, matched by path+label (checks mirror numbers[] in order, but be tolerant). */
export const checkFor = (l: AssistantLog, n: { label: string; path: string }, idx: number) => l.checks.find((c) => c.label === n.label && c.path === n.path) ?? l.checks[idx];
export const fmtArgs = (args: Record<string, unknown>): string => {
  const e = Object.entries(args);
  return e.length ? e.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ") : "";
};
