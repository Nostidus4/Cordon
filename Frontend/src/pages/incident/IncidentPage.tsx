// Incident (scene 4, spec §10.5): split screen "Không có Cordon" (simulated, left) vs "Có Cordon" (live, right).
// Left is computed from shared/scenario4.ts and driven by the step the right side receives.
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Badge, Button, Skeleton } from "../../components/ui";
import { useActions } from "../../hooks/useActions";
import { useAttempts } from "../../hooks/useAttempts";
import { useDistrict } from "../../hooks/useDistrict";
import { useHealth } from "../../hooks/useHealth";
import { useScenarioRuns } from "../../hooks/useScenarioRuns";
import { useStream } from "../../hooks/useStream";
import { useUiStore } from "../../store/uiStore";
import type { AgentRun, Attempt } from "../../types";
import { DemoControls, type Stage } from "./DemoControls";
import { NextPulse } from "./NextPulse";
import { ReplayBar } from "./ReplayBar";
import { WithGuardianPane } from "./WithGuardianPane";
import { WithoutGuardianPane } from "./WithoutGuardianPane";
import { deriveView } from "./incidentView";
import { leftStateAtStep, leftStepFromAttempts } from "./leftSimulation";
import { pickReplayRun, useReplayPlayer } from "./replay";
import { policyLabel } from "../../lib/policy";

export default function IncidentPage() {
  useEffect(() => { if (import.meta.env.DEV) void import("./devAutoplay").then((m) => m.runDevAutoplay()); }, []);
  const reduce = useReducedMotion();
  const mode = useUiStore((s) => s.mode);
  const demoMode = useUiStore((s) => s.demoMode);
  const replayRunId = useUiStore((s) => s.replayRunId);
  const setReplayRunId = useUiStore((s) => s.setReplayRunId);
  const replay = mode === "replay";
  const { data: health } = useHealth();
  const actions = useActions();
  const live = useAttempts();
  const { data: runs } = useScenarioRuns();
  const { data: district } = useDistrict("minh");

  // replay source
  useEffect(() => { if (replay && !replayRunId) { const id = pickReplayRun(runs); if (id) setReplayRunId(id); } }, [replay, replayRunId, runs, setReplayRunId]);
  const player = useReplayPlayer(replay ? replayRunId : null);

  // latest agent sentence (from the stream, so it also shows when "Bắt đầu tấn công" runs the agent first)
  const [agentRun, setAgentRun] = useState<AgentRun | null>(null);
  useStream((m) => { if (m.type === "agent_run") setAgentRun(m.data); else if (m.type === "reset") { setAgentRun(null); setAttacking(false); } }, ["agent_run", "reset"]);
  const [attacking, setAttacking] = useState(false);
  // Attempts pushed by the stream are kept locally too, so one that arrives while the initial fetch is in flight is never lost.
  const [streamed, setStreamed] = useState<Attempt[]>([]);
  useStream((m) => { if (m.type === "attempt") setStreamed((s) => (s.some((a) => a.id === m.data.id) ? s : [...s, m.data])); else setStreamed([]); }, ["attempt", "reset"]);
  const liveAttempts = useMemo(() => {
    const base = live.data ?? [];
    const run = streamed.length ? streamed[streamed.length - 1].runId : base[base.length - 1]?.runId;
    const extra = streamed.filter((a) => a.runId === run && !base.some((b) => b.id === a.id));
    return [...base.filter((a) => !run || a.runId === run), ...extra];
  }, [live.data, streamed]);

  const attempts = replay ? player.attempts : liveAttempts;
  const view = useMemo(() => deriveView(attempts, replay ? false : !!district?.locked), [attempts, replay, district?.locked]);
  const left = useMemo(() => leftStateAtStep(leftStepFromAttempts(view.attempts)), [view.attempts]);
  const policyActive = (policyLabel(health) ?? 1) >= 2;
  useEffect(() => { if (view.attackDone || attempts.length === 0) setAttacking(false); }, [view.attackDone, attempts.length]);

  const done = { agent: view.maxStep >= 0 || !!agentRun, attack: view.attackDone, lock: view.locked, step7: !!view.step7 };
  const stage: Stage = !done.agent ? "agent" : attacking && !view.attackDone ? "attacking" : !done.attack ? "attack" : !done.lock ? "lock" : !done.step7 ? "step7" : "done";
  const agentNote = agentRun && agentRun.outcome === "ok" ? agentRun.reasonText : undefined;
  const showV1Callout = !replay && health && !policyActive;

  const lock = () => actions.lock.mutate({ principalId: "minh", member: "lan" });
  const attack = () => { setAttacking(true); actions.runScene4.mutate(undefined, { onError: () => setAttacking(false) }); };
  const emptyHint = replay ? "Đang tải bản đã lưu…" : demoMode ? "Chưa có lần thử nào. Bấm “Chạy agent buổi sáng” để bắt đầu cảnh 4." : "Chưa có lần thử nào trong ngày.";

  return (
    <div className="-mb-6 -mt-4 flex flex-col gap-2.5 pb-2" style={{ height: `calc(100vh - var(--chrome-h) - ${replay ? 35 : 9}px)` }}>
      <div className="flex items-center justify-between gap-6">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-text">Sự cố</h1>
          <span className="rounded-md border border-line px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-faint">Incident</span>
          <p className="hidden truncate text-[13px] text-muted 2xl:block">Cùng một vụ chiếm máy, hai kết quả.</p>
        </div>
        {replay ? (
          <div className="min-w-0 flex-1"><ReplayBar runs={runs ?? []} runId={replayRunId} onRun={setReplayRunId} shown={player.shown} total={player.total} playing={player.playing} onToggle={player.toggle} onSeek={player.seek} onRestart={player.restart} /></div>
        ) : demoMode ? (
          <DemoControls stage={stage} done={done} policyActive={policyActive}
            busy={{ agent: actions.runAgent.isPending, attack: actions.runScene4.isPending, lock: actions.lock.isPending, step7: actions.step7.isPending }}
            onAgent={() => actions.runAgent.mutate()} onAttack={attack} onLock={lock} onStep7={() => actions.step7.mutate()} />
        ) : <Badge tone="brand">chỉ xem · bật chế độ demo để điều khiển</Badge>}
      </div>

      {showV1Callout ? (
        <motion.div initial={reduce ? false : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} role="alert" className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-warn/50 bg-warn-soft px-4 py-2.5">
          <AlertTriangle className="size-5 shrink-0 text-warn" aria-hidden />
          <p className="flex-1 text-[13px] text-text"><b className="text-warn">Đang ở policy v1:</b> 5 thẻ của anh Minh chưa có trần chung 30.000/ngày, nên cảnh này chưa thể hiện đúng. Áp dụng policy v2 trước khi tấn công.</p>
          <NextPulse on><Button size="sm" variant="primary" loading={actions.policyV2.isPending} onClick={() => actions.policyV2.mutate()} data-testid="apply-v2">Áp dụng policy v2 (Lan + Trang duyệt)</Button></NextPulse>
        </motion.div>
      ) : null}

      {replay && player.loading ? <Skeleton className="min-h-0 flex-1 rounded-[var(--radius-xl)]" /> : (
        <div className="relative grid min-h-0 flex-1 grid-cols-[minmax(0,4fr)_minmax(0,8fr)] gap-4">
          <WithoutGuardianPane state={left} />
          <WithGuardianPane view={view} policyActive={policyActive || replay} replay={replay} agentNote={agentNote} onLock={replay ? undefined : lock} locking={actions.lock.isPending}
            recommendLock={demoMode && !replay && stage === "lock"} emptyHint={emptyHint} />
          <div aria-hidden className="pointer-events-none absolute left-[calc(4/12*100%-8px)] top-1/2 z-20 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-line-strong bg-bg text-[10px] font-bold uppercase tracking-wider text-muted shadow-[var(--shadow-card)]">vs</div>
        </div>
      )}
    </div>
  );
}
