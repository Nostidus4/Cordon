// Left: 5 bars (one per key, cap 20.000), total 100.000, labelled "mô phỏng". Not on-chain: computed client-side (spec §4.3 / §10.5).
import { motion, useReducedMotion } from "framer-motion";
import { Skull } from "lucide-react";
import { AnimatedNumber, cn } from "../../components/ui";
import { fmtDisplay, toBase } from "../../lib/format";
import { KindIcon } from "./CardTile";
import type { LeftState } from "./leftSimulation";

function Bar({ b }: { b: LeftState["bars"][number] }) {
  const pct = (b.spent / b.cap) * 100;
  return (
    <li className={cn("flex flex-1 flex-col justify-center rounded-[var(--radius-md)] border px-3 py-1 transition-colors duration-500", b.drained ? "border-bad/35 bg-bad-soft/70" : "border-line bg-white/[0.03]", b.active && "border-bad/80")}>
      <div className="mb-1.5 flex items-center gap-2">
        <span className={cn("grid size-6 place-items-center rounded-md", b.drained ? "bg-bad/20 text-bad" : "bg-white/8 text-muted")}><KindIcon kind={b.kind} className="size-3.5" /></span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-text">{b.label}</span>
        <span className="tnum text-[12px] text-muted"><b className={cn(b.drained ? "text-bad" : "text-text")}>{fmtDisplay(toBase(b.spent))}</b> / {fmtDisplay(toBase(b.cap))}</span>
        <span className={cn("w-4 text-center text-[12px] font-bold", b.drained ? "text-bad" : "text-faint")} title={b.drained ? "bị rút hết hạn mức riêng" : "chưa bị rút"}><span aria-hidden>{b.drained ? "✕" : "·"}</span><span className="sr-only">{b.drained ? "bị rút hết" : "chưa bị rút"}</span></span>
      </div>
      <div role="progressbar" aria-label={`${b.label}: hạn mức riêng`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} className="h-2.5 overflow-hidden rounded-full bg-white/8">
        <motion.div className="h-full rounded-full bg-bad shadow-[0_0_12px_var(--color-bad)]" initial={false} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 70, damping: 16 }} />
      </div>
    </li>
  );
}

export function WithoutGuardianPane({ state }: { state: LeftState }) {
  const reduce = useReducedMotion();
  const heat = state.total / 100_000; // 0..1: red grows with the loss
  return (
    <section aria-labelledby="left-title" data-pane="without" data-tour="inc-without-guardian" className="relative flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-xl)] border border-bad/25 bg-[#12091f]/70 p-4 pb-14 shadow-[var(--shadow-card)]">
      <div aria-hidden className="pointer-events-none absolute inset-0 transition-opacity duration-700" style={{ opacity: 0.15 + heat * 0.85, background: "radial-gradient(120% 70% at 50% 100%, rgb(229 56 75 / 0.22), transparent 70%)" }} />
      <header className="relative mb-3 flex items-start justify-between gap-2">
        <div>
          <h2 id="left-title" className="text-[17px] font-bold leading-tight text-text">Không có GuardianAI</h2>
          <p className="mt-0.5 text-[12px] text-muted">5 trần riêng · không trần chung · không whitelist</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-sim/55 bg-sim/10 px-2.5 py-1 text-[11px] font-semibold text-sim"><span aria-hidden>◇</span> mô phỏng</span>
      </header>
      <ul className="relative flex min-h-0 flex-1 flex-col gap-1.5">{state.bars.map((b) => <Bar key={b.id} b={b} />)}</ul>
      <div className="relative pt-3">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-bad/90"><Skull className="size-3.5" aria-hidden /> Công ty mất trong ngày <span className="font-medium normal-case tracking-normal text-bad/60">· {state.drainedCount}/5 thẻ bị rút hết</span></p>
        <motion.p key={state.step} animate={reduce || state.step === 0 ? undefined : { scale: [1, 1.04, 1] }} transition={{ duration: 0.5 }} style={{ transformOrigin: "left center", textShadow: `0 0 ${10 + heat * 38}px rgb(255 107 122 / ${0.15 + heat * 0.55})` }}
          className="mt-0.5 flex items-baseline gap-2 text-bad">
          <AnimatedNumber value={state.total} duration={0.9} className="text-[68px] font-extrabold leading-none tracking-tight" />
          <span className="text-xl font-semibold text-bad/70">tUSDC</span>
        </motion.p>
        <div className="mt-1.5 min-h-[26px]">
          {state.step >= 5 ? (
            <motion.p initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-semibold italic text-bad">
              Ngày mai lại mất tiếp…
              {[2, 3].map((d, i) => (
                <motion.span key={d} className="tnum rounded-full border border-bad/40 bg-bad-soft px-2 py-0.5 text-[11px] not-italic" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: [0, 1, 1, 0.55] }} transition={{ delay: 0.6 + i * 0.5, duration: 1.6, repeat: reduce ? 0 : Infinity, repeatDelay: 1.5 }}>
                  ngày {d} · +100.000
                </motion.span>
              ))}
            </motion.p>
          ) : <p className="text-[12.5px] text-faint">{state.step === 0 ? "Chưa có gì xảy ra…" : "Kẻ gian đang rút từng thẻ, không ai chặn…"}</p>}
        </div>
      </div>
    </section>
  );
}
