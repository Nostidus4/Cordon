// Pure helpers of the Assistant section (spec §9.4): verification summary of one log.
import type { AssistantLog } from "../../types";

export interface LogSummary { total: number; verified: number; failed: number; uncovered: number; fallback: boolean; allOk: boolean }
export function summarizeLog(l: AssistantLog): LogSummary {
  const { checks, uncovered } = l;
  const verified = checks.filter((c) => c.match).length;
  const fallback = l.toolCalls.length === 0 && checks.length === 0;
  return { total: checks.length, verified, failed: checks.length - verified, uncovered: uncovered.length, fallback, allOk: l.numbersVerified && verified === checks.length && uncovered.length === 0 };
}
/** Check of a given number, matched by label+value (checks mirror the answer's numbers in order, but be tolerant). */
export const checkFor = (l: AssistantLog, n: { label: string; value: string }, idx: number) => l.checks.find((c) => c.label === n.label && c.value === n.value) ?? l.checks[idx];
export const fmtArgs = (args: Record<string, unknown>): string => {
  const e = Object.entries(args);
  return e.length ? e.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ") : "";
};
