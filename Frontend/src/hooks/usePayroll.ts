// Payroll float (B04): state, report and the demo controls. Live mode is pushed by SSE `payroll_updated`;
// mock mode refetches after each action. The "month in 10 minutes" player advances the virtual clock once a second.
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { payrollApi } from "../lib/api/payroll";
import type { PayrollState } from "../types";
import { useStream } from "./useStream";

export const payrollKeys = { state: ["payroll", "state"] as const, report: ["payroll", "report"] as const };

export function usePayrollState() {
  const qc = useQueryClient();
  useStream((m) => { if (m.type === "payroll_updated") qc.setQueryData<PayrollState>(payrollKeys.state, m.data); }, ["payroll_updated"]);
  return useQuery({ queryKey: payrollKeys.state, queryFn: payrollApi.getState });
}

export const usePayrollReport = () => useQuery({ queryKey: payrollKeys.report, queryFn: payrollApi.getReport });

export function usePayrollActions() {
  const qc = useQueryClient();
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["payroll"] });
    void qc.invalidateQueries({ queryKey: ["city"] });
    void qc.invalidateQueries({ queryKey: ["building"] });
  };
  const opts = { onSuccess: refresh };
  return {
    advance: useMutation({ mutationFn: (seconds: number) => payrollApi.advance(seconds), ...opts }),
    freeze: useMutation({ mutationFn: (v: { venue: string; frozen: boolean }) => payrollApi.setFrozen(v.venue, v.frozen), ...opts }),
    kill: useMutation({ mutationFn: () => payrollApi.kill(), ...opts }),
    runAgent: useMutation({ mutationFn: () => payrollApi.runAgent(), ...opts }),
    finalize: useMutation({ mutationFn: () => payrollApi.finalize(), ...opts }),
    execute: useMutation({ mutationFn: () => payrollApi.execute(), ...opts }),
    reset: useMutation({ mutationFn: () => payrollApi.reset(), ...opts }),
  };
}

/** "Chạy một tháng": every real second advance `timeScale` virtual seconds (4320 = 30 days in 10 minutes). */
export function usePayrollPlayer(state: PayrollState | undefined) {
  const { advance, runAgent } = usePayrollActions();
  const [playing, setPlaying] = useState(false);
  const ticks = useRef(0);
  const scale = state?.timeScale ?? 4320;
  const done = !state || state.phase === "paid" || state.now >= state.payday;
  const advanceRef = useRef(advance.mutate); advanceRef.current = advance.mutate;
  const agentRef = useRef(runAgent.mutate); agentRef.current = runAgent.mutate;
  useEffect(() => {
    if (!playing || done) return;
    const id = setInterval(() => {
      ticks.current += 1;
      advanceRef.current(scale);
      if (ticks.current % Math.max(1, Math.round(86400 / scale)) === 0) agentRef.current(); // the agent works once per virtual day
    }, 1000);
    return () => clearInterval(id);
  }, [playing, done, scale]);
  useEffect(() => { if (done) setPlaying(false); }, [done]);
  const toggle = useCallback(() => setPlaying((p) => !p), []);
  return { playing, toggle };
}
