// Replay a saved scenario_run at 3s/step with play/pause/scrub (spec §10.5). Own hook (the foundation useReplay has no scrub).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import type { Attempt, ScenarioRun } from "../../types";
import { byStep } from "../../lib/dto";
import { qk } from "../../hooks/queryKeys";

export const REPLAY_STEP_MS = 3000;
export const REPLAY_FIRST_MS = 700;
/** One tick of the player: after the delay advance a step, or report done when everything is shown. Returns cancel. */
export function scheduleReplayStep(shown: number, total: number, stepMs: number, onStep: () => void, onDone: () => void): () => void {
  if (shown >= total) { onDone(); return () => {}; }
  const t = setTimeout(onStep, shown === 0 ? REPLAY_FIRST_MS : stepMs);
  return () => clearTimeout(t);
}
const sortAttempts = (a: Attempt[]) => [...a].sort(byStep);

/** Prefer the recorded take; otherwise the newest finished run with attempts. */
export function pickReplayRun(runs: ScenarioRun[] | undefined): string | null {
  if (!runs?.length) return null;
  return (runs.find((r) => r.status === "recorded") ?? [...runs].reverse().find((r) => r.attempts.length > 0 && r.status !== "running") ?? null)?.id ?? null;
}

/** DEV only: `?replayMs=400` speeds the replay up for screenshots. */
const devStepMs = () => (import.meta.env.DEV ? Number(new URLSearchParams(window.location.search).get("replayMs")) || undefined : undefined);

export function useReplayPlayer(runId: string | null, stepMs = devStepMs() ?? REPLAY_STEP_MS) {
  const { data, isLoading } = useQuery({ queryKey: qk.attempts(runId), queryFn: () => api.getAttempts(runId!), enabled: !!runId });
  const all = useMemo(() => sortAttempts(data ?? []), [data]);
  const total = all.length;
  const [shown, setShown] = useState(0);
  const [playing, setPlaying] = useState(true);
  useEffect(() => { setShown(0); setPlaying(true); }, [runId]);
  useEffect(() => {
    if (!playing || !total) return;
    return scheduleReplayStep(shown, total, stepMs, () => setShown((n) => n + 1), () => setPlaying(false));
  }, [playing, shown, total, stepMs]);
  const seek = useCallback((n: number) => { setPlaying(false); setShown(Math.max(0, Math.min(total, n))); }, [total]);
  const toggle = useCallback(() => {
    if (playing) { setPlaying(false); return; }
    if (shown >= total) setShown(0);
    setPlaying(true);
  }, [playing, shown, total]);
  const restart = useCallback(() => { setShown(0); setPlaying(true); }, []);
  return { attempts: all.slice(0, shown), total, shown, playing, loading: isLoading, seek, toggle, restart, stepMs };
}
