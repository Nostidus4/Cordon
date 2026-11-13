// CITY-005: violations board data + the agent runs that carry an injected text. Polls lightly; the SSE bridge also invalidates "violations".
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "./queryKeys";
import type { AgentRun } from "../types";

export const useViolations = (limit = 20) =>
  useQuery({ queryKey: qk.violations(limit), queryFn: () => api.getViolations(limit), retry: false, refetchInterval: 8000 });

/** Newest run that was fed a foreign text (fault F06), plus the newest run overall. */
export const pickGuardRuns = (runs: AgentRun[] | undefined): { injected: AgentRun | null; latest: AgentRun | null } => {
  const list = runs ?? [];
  return { injected: [...list].reverse().find((r) => !!r.untrustedInput) ?? null, latest: list[list.length - 1] ?? null };
};

export const useGuardRuns = () =>
  useQuery({ queryKey: qk.agentRuns, queryFn: api.getAgentRuns, retry: false, refetchInterval: 8000, select: pickGuardRuns });
