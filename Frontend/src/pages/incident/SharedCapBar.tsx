// District shared cap 30.000/ngày bar. The filled value comes ONLY from the attempt/event `principalSpentAfter` (spec §10.5),
// never summed client-side. The ghost segment is purely illustrative: it marks the headroom a rejected DISTRICT_DAILY_CAP payment tried to take.
import { motion, useReducedMotion } from "framer-motion";
import { AnimatedNumber, STATUS_GLYPH, cn } from "../../components/ui";
import { DISTRICT_CAP_V2 } from "../../shared/scenario4";
import { fmtDisplay, percentOf, toBase } from "../../lib/format";
import { toDisp } from "./incidentView";

interface Props {
  /** latest principalSpentAfter */
  spent: bigint | null;
  /** principalSpentAfter at step 0 (Trợ lý Cân đối, morning) */
  agentBase: bigint;
  /** difference of two event values (spent - agentBase): what the attacker got out */
  attacker: bigint;
  /** amount of the payment rejected for DISTRICT_DAILY_CAP (ghost "would-be" segment) */
  ghostAmount: bigint | null;
  locked: boolean;
  /** policy v2 in force (the shared cap exists) */
  active: boolean;
}

const CAP = toBase(DISTRICT_CAP_V2);
const pctOf = (v: bigint) => Math.min(100, percentOf(v, CAP));

export function SharedCapBar({ spent, agentBase, attacker, ghostAmount, locked, active }: Props) {
  const reduce = useReducedMotion();
  const v = spent ?? 0n;
  const full = v >= CAP;
  const near = pctOf(v) >= 80;
  const agentPct = pctOf(agentBase < v ? agentBase : v);
  const attackerPct = Math.max(0, pctOf(v) - agentPct);
  const tone = locked ? "lock" : full ? "bad" : near ? "warn" : "ok";
  const attackerBg = { lock: "bg-lock", bad: "bg-bad", warn: "bg-warn", ok: "bg-ok" }[tone];
  const noteColor = { lock: "text-lock", bad: "text-bad", warn: "text-warn", ok: "text-ok" }[tone];
  const note = !active ? "chưa có trần chung" : locked ? "đã khoá" : full ? "hết hạn mức" : near ? "gần trần" : "trong rào chắn";
  return (
    <div className={cn(!active && "opacity-55")}>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11.5px] font-semibold uppercase tracking-wider text-faint">Đã dùng chung hôm nay · cả khu</p>
        <p className={cn("text-[12px] font-semibold", noteColor)}><span aria-hidden>{!active ? "▲" : STATUS_GLYPH[tone === "lock" ? "locked" : tone]}</span> {note}</p>
      </div>
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <p className="flex items-baseline gap-1.5 text-text">
          <AnimatedNumber value={toDisp(v)} duration={0.8} className="text-[34px] font-bold leading-none tracking-tight" />
          <span className="text-lg font-medium text-faint">/ {fmtDisplay(CAP)}</span>
        </p>
        {ghostAmount && !locked ? (
          <motion.span initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="whitespace-nowrap rounded-md border border-bad/50 bg-bad-soft px-2 py-0.5 text-[11px] font-semibold text-bad">
            ✕ +{fmtDisplay(ghostAmount)} bị chặn
          </motion.span>
        ) : null}
      </div>
      <div className="relative mt-3.5">
        <div role="progressbar" aria-label="Hạn mức chung của khu anh Minh" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pctOf(v))}
          className={cn("relative h-[26px] w-full overflow-hidden rounded-full bg-white/8 ring-1 ring-inset ring-line-strong", full && !locked && "shadow-[0_0_22px_-2px_rgb(255_107_122/0.55)]")}>
          {/* ghost would-be segment */}
          {ghostAmount && !locked ? (
            <motion.div aria-hidden className="absolute inset-y-0 right-0 bg-[repeating-linear-gradient(135deg,rgb(255_107_122/0.5)_0_5px,rgb(255_107_122/0.12)_5px_10px)]"
              style={{ left: `${pctOf(v)}%` }} initial={{ opacity: 0 }} animate={{ opacity: reduce ? 0.85 : [0.25, 0.95, 0.5, 0.95] }} transition={{ duration: 1.4, repeat: reduce ? 0 : 2 }} />
          ) : null}
          <div className="absolute inset-y-0 left-0 flex" style={{ width: "100%" }}>
            <motion.div className="h-full bg-brand" initial={false} animate={{ width: `${agentPct}%` }} transition={{ type: "spring", stiffness: 90, damping: 18 }} />
            <motion.div className={cn("h-full", attackerBg)} initial={false} animate={{ width: `${attackerPct}%` }} transition={{ type: "spring", stiffness: 90, damping: 18 }} />
          </div>
          {locked ? <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(255_255_255/0.1)_6px_12px)]" /> : null}
        </div>
        {/* hard cap marker + overflow tab for the blocked payment */}
        <span aria-hidden className="absolute -top-1 right-0 h-[34px] w-[3px] rounded bg-text/80" />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] text-faint">
        <span>0</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><i className="size-2 rounded-sm bg-brand" /> Trợ lý Cân đối (sáng) <b className="tnum text-muted">{fmtDisplay(agentBase)}</b></span>
          <span className="flex items-center gap-1"><i className={cn("size-2 rounded-sm", attackerBg)} /> Kẻ gian <b className="tnum text-muted">{fmtDisplay(attacker)}</b></span>
        </span>
        <span>{fmtDisplay(CAP)}</span>
      </div>
    </div>
  );
}
