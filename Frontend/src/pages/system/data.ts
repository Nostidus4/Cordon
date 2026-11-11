// Queries for the dashboard. Existing hooks are reused; the two read-only additions (agent runs, assistant logs) live here.
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { useStream } from "../../hooks/useStream";

export const sysKeys = { agentRuns: ["sys", "agentRuns"] as const, assistantLogs: ["sys", "assistantLogs"] as const };

export const useAgentRuns = () => useQuery({ queryKey: sysKeys.agentRuns, queryFn: api.getAgentRuns, retry: false });
export const useAssistantLogs = () => useQuery({ queryKey: sysKeys.assistantLogs, queryFn: api.getAssistantLogs, retry: false });

/** Keeps the dashboard-only queries fresh (the shared StreamBridge does not know them). */
export function useSysInvalidation(qc: { invalidateQueries: (o: { queryKey: readonly unknown[] }) => unknown }) {
  useStream((m) => {
    if (m.type === "agent_run" || m.type === "reset") qc.invalidateQueries({ queryKey: sysKeys.agentRuns });
    if (m.type === "reset") qc.invalidateQueries({ queryKey: sysKeys.assistantLogs });
  });
}

/** Ticks `now` every `ms` (for uptime / relative times). */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

/** Keys whose value changed within the last `ms` (first render never flashes). Drives the "just changed" highlight. */
export function useChanged(values: Record<string, string>, ms = 3400): Set<string> {
  const prev = useRef<Record<string, string> | null>(null);
  const [changed, setChanged] = useState<Record<string, number>>({});
  const sig = JSON.stringify(values);
  const latest = useRef(values);
  latest.current = values;
  useEffect(() => {
    const cur = latest.current, p = prev.current;
    prev.current = cur;
    if (!p) return;
    const now = Date.now(), add: Record<string, number> = {};
    for (const k of Object.keys(cur)) if (p[k] !== undefined && p[k] !== cur[k]) add[k] = now;
    if (!Object.keys(add).length) return;
    setChanged((c) => ({ ...c, ...add }));
    setTimeout(() => setChanged((c) => { const n = { ...c }; for (const k of Object.keys(add)) if (n[k] === add[k]) delete n[k]; return n; }), ms);
  }, [sig, ms]);
  return new Set(Object.keys(changed));
}
