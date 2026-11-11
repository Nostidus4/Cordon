import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Attempt } from "../types";
import { qk } from "./queryKeys";
export const useScenarioRuns = () => useQuery({ queryKey: qk.runs, queryFn: api.getScenarioRuns });

/** Replay a saved run: reveals one attempt every `stepMs` (spec §10.5: 3s per step). */
export function useReplay(runId: string | null, stepMs = 3000) {
  const { data } = useQuery({ queryKey: ["attempts", runId ?? "none"], queryFn: () => api.getAttempts(runId!), enabled: !!runId });
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setShown(0); setPlaying(!!runId); }, [runId]);
  useEffect(() => {
    if (!playing || !data) return;
    if (shown >= data.length) { setPlaying(false); return; }
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 400 : stepMs);
    return () => clearTimeout(t);
  }, [playing, shown, data, stepMs]);
  const attempts: Attempt[] = (data ?? []).slice(0, shown);
  return { attempts, total: data?.length ?? 0, shown, playing, play: () => { if (data && shown >= data.length) setShown(0); setPlaying(true); }, pause: () => setPlaying(false), restart: () => { setShown(0); setPlaying(true); } };
}
