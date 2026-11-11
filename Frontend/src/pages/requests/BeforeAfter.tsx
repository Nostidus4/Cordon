// Enforced/Estimated before -> after with % of main treasury, as an animated comparison (spec §10.4, F1).
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, TriangleAlert } from "lucide-react";
import { AnimatedNumber, Tooltip, cn } from "../../components/ui";
import { fmtDisplay } from "../../lib/format";
import { beforeAfter, type GapBA, type MetricBA } from "./logic";
import type { ProposalDraft } from "../../types";

const num = (b: bigint) => Number(b / 1_000_000n);
const TONE = {
  ok: { text: "text-ok", bar: "bg-ok", chip: "border-ok/40 bg-ok-soft text-ok", glyph: "▼", glow: "shadow-[0_0_18px_-2px_var(--color-ok)]" },
  bad: { text: "text-bad", bar: "bg-bad", chip: "border-bad/45 bg-bad-soft text-bad", glyph: "▲", glow: "shadow-[0_0_18px_-2px_var(--color-bad)]" },
  muted: { text: "text-muted", bar: "bg-lock", chip: "border-line bg-white/5 text-muted", glyph: "＝", glow: "" },
} as const;

function Row({ m, scale, primary, hint, delay, note }: { m: MetricBA; scale: bigint; primary?: boolean; hint: string; delay: number; note?: string }) {
  const tone = TONE[m.tone];
  const w = (v: bigint) => `${scale === 0n ? 0 : Math.max(1.5, Number((v * 1000n) / scale) / 10)}%`;
  return (
    <div className={cn("rounded-[var(--radius-md)] border border-line bg-white/[0.025] p-4", primary && "bg-white/[0.04]")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <Tooltip content={hint}>
          <span tabIndex={0} className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-faint">
            {m.label === "Enforced" ? <ShieldCheck className="size-3.5 text-ok" aria-hidden /> : <TriangleAlert className="size-3.5 text-warn" aria-hidden />}
            {m.label === "Estimated" ? "Rủi ro thật · Estimated" : "Enforced"} <span className="font-medium normal-case tracking-normal">{m.label === "Enforced" ? "· trần chain đang biết" : "· nếu quan hệ tự khai là thật"}</span>
          </span>
        </Tooltip>
        <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold tnum", tone.chip)}>
          <span aria-hidden>{tone.glyph}</span> {m.delta.text}<span className="font-medium opacity-70">/ngày</span>
        </span>
      </div>

      <div className="flex items-end gap-4">
        <div className="min-w-0">
          <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Trước</p>
          <p className={cn("tnum font-bold leading-none text-muted", primary ? "text-[34px]" : "text-2xl")}>{m.beforeDisplay}</p>
          <p className="tnum mt-1.5 text-xs text-faint">{m.beforePctText} quỹ chính</p>
        </div>
        <motion.div className="mb-5 text-faint" initial={{ x: -6, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: delay + 0.15, duration: 0.4 }}>
          <ArrowRight className="size-6" aria-hidden />
        </motion.div>
        <div className="min-w-0">
          <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-faint">Sau</p>
          <p className={cn("leading-none font-extrabold", tone.text, primary ? "text-[44px]" : "text-3xl")}>
            <AnimatedNumber from={num(m.before)} value={num(m.after)} duration={1.4} />
          </p>
          <p className="tnum mt-1.5 text-xs font-semibold text-text"><span className={tone.text}>{m.afterPctText}</span> <span className="font-normal text-faint">quỹ chính</span></p>
        </div>
      </div>

      <div className="mt-4 space-y-1.5" aria-hidden>
        <div className="relative h-2 overflow-hidden rounded-full bg-white/7">
          <motion.div className="h-full rounded-full bg-lock/70" initial={{ width: 0 }} animate={{ width: w(m.before) }} transition={{ delay, duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
        </div>
        <div className="relative h-3 overflow-hidden rounded-full bg-white/7">
          <motion.div className={cn("h-full rounded-full", tone.bar, tone.glow)} initial={{ width: w(m.before) }} animate={{ width: w(m.after) }} transition={{ delay: delay + 0.5, duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-faint"><span>trước (xám) · sau (màu)</span><span className="tnum">thang: {fmtDisplay(scale)}/ngày</span></div>
      {note ? <p className="mt-2 rounded-lg bg-white/[0.04] px-3 py-2 text-[12.5px] leading-snug text-muted">{note}</p> : null}
    </div>
  );
}

function Gap({ g }: { g: GapBA }) {
  const max = g.before > g.after ? g.before : g.after;
  const w = (v: bigint) => `${max === 0n ? 0 : Math.max(v === 0n ? 0 : 2, Number((v * 1000n) / max) / 10)}%`;
  return (
    <div className="rounded-[var(--radius-md)] border border-warn/30 bg-warn-soft px-4 py-3" data-tour="req-gap">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-warn">Khoảng mù <span className="font-medium normal-case tracking-normal opacity-80">· rủi ro thật trừ phần chain chặn</span></p>
        <p className="tnum text-sm font-bold text-text">{g.beforeDisplay} <span className="text-faint">→</span> <span className={g.closes ? "text-ok" : "text-bad"}>{g.afterDisplay}</span></p>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/30" aria-hidden>
        <motion.div className={cn("h-full rounded-full", g.closes ? "bg-ok" : "bg-bad")} initial={{ width: w(g.before) }} animate={{ width: w(g.after) }} transition={{ delay: 0.9, duration: 1.3, ease: [0.22, 1, 0.36, 1] }} />
      </div>
    </div>
  );
}

export function BeforeAfter({ report, treasury, className }: { report: Pick<ProposalDraft, "riskReport">; treasury?: bigint; className?: string }) {
  const { enforced, estimated, gap } = beforeAfter(report, treasury);
  const scale = [enforced.before, enforced.after, estimated.before, estimated.after].reduce((a, b) => (b > a ? b : a), 0n);
  const note = enforced.delta.dir === "up" && gap.closes
    ? `Trần chain biết tăng từ ${enforced.beforeDisplay} lên ${enforced.afterDisplay} vì ${"các trần riêng được thay bằng 1 trần chung"}: khoảng cách giữa “chain chặn” và “rủi ro thật” từ ${gap.beforeDisplay} về ${gap.afterDisplay}.`
    : undefined;
  return (
    <div className={cn("space-y-3", className)} data-tour="req-before-after">
      <Row m={estimated} scale={scale} primary delay={0.05} hint="Estimated: rủi ro thật nếu cả những khu nối qua quan hệ tự khai (chưa kiểm chứng) cũng bị chiếm." />
      <Row m={enforced} scale={scale} delay={0.2} note={note} hint="Enforced: số tiền tối đa mà chain thật sự cho phép chi trong 1 ngày." />
      {gap.visible ? <Gap g={gap} /> : null}
    </div>
  );
}

/** Tiny inline variant for list cards: `30.000 → 130.000`. */
export function BeforeAfterInline({ report, treasury }: { report: Pick<ProposalDraft, "riskReport">; treasury?: bigint }) {
  const { estimated: enforced } = beforeAfter(report, treasury); // lead with real risk (Estimated)
  const tone = TONE[enforced.tone];
  return (
    <div className="flex items-center gap-2 tnum">
      <span className="text-sm font-semibold text-muted">{enforced.beforeDisplay}</span>
      <ArrowRight className="size-3.5 text-faint" aria-hidden />
      <span className={cn("text-base font-extrabold", tone.text)}>{enforced.afterDisplay}</span>
      <span className="text-[11px] text-faint">· {enforced.beforePctText} → {enforced.afterPctText}</span>
    </div>
  );
}
