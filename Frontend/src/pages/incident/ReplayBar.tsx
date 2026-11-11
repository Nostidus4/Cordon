// Replay controls: play/pause/scrub at 3 s/step over a saved scenario run (spec §10.5).
import { Pause, Play, RotateCcw } from "lucide-react";
import type { ScenarioRun } from "../../types";
import { Button, IconButton } from "../../components/ui";
import { REPLAY_STEP_MS } from "./replay";

export interface ReplayBarProps {
  runs: ScenarioRun[]; runId: string | null; onRun: (id: string) => void;
  shown: number; total: number; playing: boolean; onToggle: () => void; onSeek: (n: number) => void; onRestart: () => void;
}
export function ReplayBar({ runs, runId, onRun, shown, total, playing, onToggle, onSeek, onRestart }: ReplayBarProps) {
  const usable = runs.filter((r) => r.attemptCount > 0);
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-brand/35 bg-brand-soft/60 px-3 py-2" role="group" aria-label="Điều khiển Replay">
      <Button size="sm" variant="primary" icon={playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />} onClick={onToggle} disabled={!total}>{playing ? "Tạm dừng" : shown >= total && total ? "Phát lại" : "Phát"}</Button>
      <IconButton label="Về đầu" size="sm" icon={<RotateCcw className="size-4" />} onClick={onRestart} disabled={!total} />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative flex-1">
          <input type="range" min={0} max={Math.max(total, 1)} step={1} value={shown} onChange={(e) => onSeek(Number(e.target.value))} aria-label="Tua tới bước" aria-valuetext={`đã hiện ${shown} trên ${total} bước`} className="h-1.5 w-full cursor-pointer accent-[#8b7cf6]" disabled={!total} />
          <div className="pointer-events-none mt-1 flex justify-between px-0.5 text-[10px] text-faint" aria-hidden>
            {Array.from({ length: total + 1 }, (_, i) => <span key={i} className={i === shown ? "font-bold text-text" : i < shown ? "text-muted" : ""}>{i === 0 ? "đầu" : i - 1}</span>)}
          </div>
        </div>
        <span className="tnum whitespace-nowrap text-[12px] font-semibold text-text">bước {shown}/{total}</span>
      </div>
      <label className="flex items-center gap-2 text-[12px] text-muted">
        <span className="whitespace-nowrap">Bản đã lưu</span>
        <select value={runId ?? ""} onChange={(e) => onRun(e.target.value)} className="max-w-[260px] rounded-md border border-line-strong bg-surface px-2 py-1 text-[12px] text-text">
          {usable.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.attemptCount} bước</option>)}
        </select>
      </label>
      <span className="whitespace-nowrap rounded-md bg-white/8 px-2 py-1 text-[11px] font-semibold text-muted">{REPLAY_STEP_MS / 1000} giây/bước</span>
    </div>
  );
}
