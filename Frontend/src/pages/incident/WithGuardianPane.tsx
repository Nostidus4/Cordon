// Right: "Ví chung của anh Minh" live from SSE; numbers only from principalSpentAfter (spec §10.5).
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { reasonVi } from "../../shared/reasonCodes";
import { Lock, ShieldCheck } from "lucide-react";
import { AnimatedNumber, Button, StatusChip, cn } from "../../components/ui";
import { fmtDisplay } from "../../lib/format";
import type { Attempt } from "../../types";
import { AttemptTimeline } from "./AttemptTimeline";
import { CardTile } from "./CardTile";
import { NextPulse } from "./NextPulse";
import { SharedCapBar } from "./SharedCapBar";
import { toDisp, type IncidentView } from "./incidentView";

interface Props {
  view: IncidentView;
  policyActive: boolean;
  replay: boolean;
  agentNote?: string;
  onLock?: () => void;
  locking?: boolean;
  recommendLock?: boolean;
  emptyHint?: string;
}

/** "cordon" sweep: a police-tape band wiping across the 5 tiles the moment the district gets locked. */
function CordonSweep({ run }: { run: number }) {
  const reduce = useReducedMotion();
  if (!run || reduce) return null;
  return (
    <motion.div key={run} aria-hidden className="pointer-events-none absolute inset-y-[-4px] z-10 w-[26%]" initial={{ left: "-30%", opacity: 1 }} animate={{ left: "108%", opacity: [1, 1, 0.9, 0] }} transition={{ duration: 1.25, ease: [0.4, 0, 0.2, 1] }}>
      <div className="h-full w-full -skew-x-12 bg-[repeating-linear-gradient(135deg,#ffbf3c_0_14px,#1a1530_14px_28px)] opacity-90 shadow-[0_0_40px_rgb(255_191_60/0.6)]" />
    </motion.div>
  );
}

/** What the chain turned away so far (counts of attempts by reason; no money here). */
function BlockedLog({ attempts }: { attempts: Attempt[] }) {
  const blocked = attempts.filter((a) => a.outcome !== "ok" && a.reasonCode);
  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-white/[0.03] px-3.5 py-2">
      <p className="flex items-center justify-between text-[11.5px] font-semibold uppercase tracking-wider text-faint">
        <span>Rào chắn đã chặn</span><span className="tnum text-bad">{blocked.length} lần thử</span>
      </p>
      <div className="mt-1.5 flex min-h-[22px] flex-wrap gap-1.5">
        <AnimatePresence initial={false}>
          {blocked.map((a) => (
            <motion.span key={a.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="rounded-full border border-bad/40 bg-bad-soft px-2 py-0.5 text-[11px] font-medium text-bad">
              <span aria-hidden>✕</span> {reasonVi(a.reasonCode)}
            </motion.span>
          ))}
        </AnimatePresence>
        {blocked.length === 0 ? <span className="text-[12px] text-faint">Chưa có lần thử nào bị chặn.</span> : null}
      </div>
    </div>
  );
}

export function WithGuardianPane({ view, policyActive, replay, agentNote, onLock, locking, recommendLock, emptyHint }: Props) {
  const reduce = useReducedMotion();
  const prev = useRef(view.locked);
  const [sweep, setSweep] = useState(0);
  useEffect(() => { if (view.locked && !prev.current) setSweep((n) => n + 1); prev.current = view.locked; }, [view.locked]);
  const ghostAmount = view.ghost?.action.amount ? BigInt(view.ghost.action.amount.raw) : null;
  const ghostLive = !view.locked && !!view.ghost;
  return (
    <section aria-labelledby="right-title" data-pane="with" data-tour="inc-with-guardian" className="relative flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-ok/25 bg-[#071a24]/70 p-4 shadow-[var(--shadow-card)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_80%_0%,rgb(52_224_180/0.10),transparent_70%)]" />
      <header className="relative mb-2.5 flex items-start justify-between gap-3">
        <div>
          <h2 id="right-title" className="flex items-center gap-2 text-[17px] font-bold leading-tight text-text">Có Cordon <ShieldCheck className="size-[18px] text-ok" aria-hidden /></h2>
          <p className="mt-0.5 text-[12px] text-muted"><b className="text-text">Ví chung của anh Minh</b> · {replay ? "phát lại từ bản đã lưu" : "dữ liệu trực tiếp từ chain"}</p>
        </div>
        <div className="flex items-center gap-2">
          {replay ? <StatusChip status="info" size="sm">↺ replay</StatusChip> : <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/40 bg-ok-soft px-2.5 py-1 text-[11px] font-semibold text-ok"><span aria-hidden className="size-1.5 animate-pulse rounded-full bg-ok" /> live</span>}
          {view.locked ? <StatusChip status="locked" size="sm">khu đã khoá</StatusChip> : <StatusChip status="ok" size="sm">đang bảo vệ</StatusChip>}
        </div>
      </header>

      <div className="relative">
        <ul className="relative grid grid-cols-5 gap-2.5" aria-label="5 thẻ của khu anh Minh">
          {view.tiles.map((t, i) => <li key={t.meta.id} className="min-h-0"><CardTile tile={t} index={i} /></li>)}
        </ul>
        <CordonSweep run={sweep} />
      </div>

      <div className="relative mt-2.5 grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,6.6fr)] gap-4">
        <div className="flex min-h-0 flex-col gap-2.5">
          <div className="rounded-[var(--radius-lg)] border border-line bg-white/[0.03] px-4 pb-2.5 pt-3">
            <SharedCapBar spent={view.sharedSpent} agentBase={view.agentBase} attacker={view.attackerSpent} ghostAmount={ghostLive ? ghostAmount : null} locked={view.locked} active={policyActive} />
          </div>
          <motion.div animate={reduce || !view.attackDone ? undefined : { borderColor: ["rgb(52 224 180 / 0.9)", "rgb(52 224 180 / 0.3)"] }} transition={{ duration: 1.2 }}
            className="rounded-[var(--radius-lg)] border border-ok/30 bg-ok-soft px-4 py-2.5">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-ok/90">Kẻ gian chi ra được</p>
            <p className="mt-0.5 flex items-baseline gap-2 text-ok" style={{ textShadow: "0 0 28px rgb(52 224 180 / 0.35)" }}>
              <AnimatedNumber value={toDisp(view.attackerSpent)} duration={0.9} className="text-[52px] font-extrabold leading-none tracking-tight" />
              <span className="text-xl font-semibold text-ok/70">tUSDC</span>
            </p>
            <p className="mt-1 text-[12px] text-muted">
              Chặn lại ở trần chung {view.locked ? "và đã khoá cả khu." : "30.000/ngày."}
              {view.agentBase > 0n ? <> Đã dùng chung <b className="tnum text-text">{fmtDisplay(view.sharedSpent ?? 0n)}</b> gồm <b className="tnum text-text">{fmtDisplay(view.agentBase)}</b> của Trợ lý Cân đối.</> : null}
            </p>
          </motion.div>
          <BlockedLog attempts={view.attempts} />
          <div className="mt-auto">
            {replay ? (
              <p data-tour="inc-lock" className="rounded-[var(--radius-md)] border border-line px-3 py-2 text-center text-[11.5px] text-faint">Replay: nút khoá chỉ hoạt động ở chế độ Live.</p>
            ) : view.locked ? (
              <motion.div data-tour="inc-lock" initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="flex h-14 items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-lock/40 bg-lock-soft text-[15px] font-semibold text-lock">
                <Lock className="size-5" aria-hidden /> Đã khoá · 5 thẻ gạch khỏi chain
              </motion.div>
            ) : (
              <>
                <NextPulse on={!!recommendLock} tone="bad" className="w-full" radius="rounded-[var(--radius-xl)]">
                  <Button variant="danger" size="xl" className="w-full" icon={<Lock className="size-6" aria-hidden />} loading={locking} onClick={onLock} data-tour="inc-lock" disabled={replay || !onLock} disabledReason={replay ? "Đang ở chế độ Replay" : undefined}>
                    Khoá khu anh Minh
                  </Button>
                </NextPulse>
                <p className="mt-1 text-center text-[11px] leading-tight text-faint">Chị Lan bấm một mình là đủ: <b className="text-muted">siết chỉ cần 1 người</b>.</p>
              </>
            )}
          </div>
        </div>
        <div className="flex min-h-0 flex-col">
          <AttemptTimeline attempts={view.attempts as Attempt[]} agentNote={agentNote} empty={emptyHint} />
        </div>
      </div>
    </section>
  );
}
