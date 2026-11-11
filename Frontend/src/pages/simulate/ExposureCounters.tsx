// The three big numbers (spec §10.3): Bạn nghĩ · Đã khoá chặt (Enforced) · Ước tính (Estimated), each with % of the main treasury.
import { motion } from "framer-motion";
import { HelpCircle } from "lucide-react";
import type { ReactNode } from "react";
import { AnimatedNumber, Skeleton, Tooltip, cn } from "../../components/ui";
import { fmtPercent, percentOf } from "../../lib/format";
import type { SimTotals } from "../../types";

const units = (b: bigint) => Number(b / 1_000_000n);
const pct = (v: bigint, treasury: bigint) => fmtPercent(percentOf(v, treasury), 1);

function Card({ tone, label, en, help, children, className, delay = 0 }: { tone: "plain" | "ok" | "bad"; label: string; en?: string; help: ReactNode; children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.35 }}
      className={cn("glass relative min-w-0 rounded-2xl px-4 py-3", tone === "ok" && "border-ok/40", tone === "bad" && "border-bad/60 shadow-[var(--shadow-glow-bad)]", className)}>
      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted">
        <span className={cn(tone === "ok" && "text-ok", tone === "bad" && "text-bad")} aria-hidden>{tone === "ok" ? "✓" : tone === "bad" ? "✕" : "○"}</span>
        <span className="text-text">{label}</span>{en ? <span className="text-faint">· {en}</span> : null}
        <Tooltip content={<span className="block max-w-64 leading-snug">{help}</span>}><button type="button" aria-label={`Giải thích: ${label}`} className="ml-auto text-faint hover:text-text"><HelpCircle className="size-3.5" aria-hidden /></button></Tooltip>
      </div>
      {children}
    </motion.div>
  );
}

export function ExposureCounters({ totals, counter, treasury, running, done, loading, action }: {
  totals?: SimTotals; counter: bigint; treasury: bigint; running: boolean; done: boolean; loading: boolean; action?: ReactNode;
}) {
  if (loading || !totals) {
    return <div data-tour="sim-exposure" className="grid grid-cols-3 gap-3">{[0, 1, 2].map((i) => <div key={i} className="glass rounded-2xl px-4 py-3"><Skeleton className="mb-3 h-3.5 w-1/2" /><Skeleton className="h-10 w-3/4" /></div>)}</div>;
  }
  const think = BigInt(totals.youThink.raw), enf = BigInt(totals.enforced.raw), est = BigInt(totals.estimated.raw);
  const ratio = think > 0n ? Number((est * 10n) / think) / 10 : 0;
  const showEst = counter < 0n ? 0n : counter;
  return (
    <div data-tour="sim-exposure" className="grid grid-cols-[1fr_1fr_1.25fr] gap-3">
      <Card tone="plain" label="Bạn nghĩ" help="Con số bạn tưởng khi giao thẻ: hạn mức trên thẻ của chính người đó." >
        <p className="mt-1 flex items-baseline gap-1.5"><span className="text-[34px] font-bold leading-none tracking-tight text-text"><AnimatedNumber value={units(think)} duration={0.6} /></span><span className="text-[12px] text-faint">/ngày</span></p>
        <p className="mt-1.5 text-[12px] text-muted tnum">{pct(think, treasury)} quỹ chính</p>
        <p className="mt-1.5 text-[12px] leading-snug text-faint [@media(max-height:880px)]:hidden">Hạn mức ghi trên thẻ của chính người này.</p>
      </Card>
      <Card tone="ok" label="Đã khoá chặt" en="Enforced" delay={0.08} help="Mức tối đa mà chain chặn cứng, tính từ những quan hệ có thật trên chain. Dù bị chiếm, kẻ xấu không thể vượt mức này.">
        <p className="mt-1 flex items-baseline gap-1.5"><span className="text-[34px] font-bold leading-none tracking-tight text-ok"><AnimatedNumber value={units(enf)} duration={0.8} /></span><span className="text-[12px] text-faint">/ngày</span></p>
        <p className="mt-1.5 text-[12px] text-muted tnum">{pct(enf, treasury)} quỹ chính · <span className="text-ok">✓ trên chain</span></p>
        <p className="mt-1.5 text-[12px] leading-snug text-faint [@media(max-height:880px)]:hidden">Chain chặn cứng: kẻ xấu không thể vượt mức này.</p>
      </Card>
      <Card tone="bad" label="Ước tính" en="Estimated" delay={0.16} help="Mức mất tối đa mỗi ngày nếu tính cả những quan hệ tự khai (ví dụ anh Minh giữ khoá của trợ lý AI). Chưa có giao dịch nào chứng minh, nhưng nên coi là có thể xảy ra.">
        <p className="mt-1 flex items-baseline gap-1.5">
          <span className="text-[44px] font-bold leading-none tracking-tight text-bad"><AnimatedNumber value={units(showEst)} duration={0.35} /></span><span className="text-[12px] text-faint">/ngày</span>
          {done && ratio > 1 ? <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 18 }} className="ml-auto whitespace-nowrap rounded-full border border-bad/55 bg-bad-soft px-2 py-0.5 text-[12px] font-bold text-bad">▲ gấp {String(ratio).replace(".", ",")} lần</motion.span> : null}
        </p>
        <p className="mt-1.5 text-[12px] text-muted tnum"><b className="text-text">{pct(showEst, treasury)}</b> quỹ chính{running ? <span className="ml-1.5 text-faint">· đang lan…</span> : null}</p>
        {est > enf ? <p className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-dashed border-sim/60 bg-sim/10 px-1.5 py-0.5 text-[11px] font-semibold text-sim"><span aria-hidden>◇</span> gồm quan hệ tự khai, chưa kiểm chứng</p> : null}
        {action ? <div className="mt-2.5">{action}</div> : null}
      </Card>
    </div>
  );
}
