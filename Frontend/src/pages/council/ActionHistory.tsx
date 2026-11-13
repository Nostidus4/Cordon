// History of tighten/loosen actions (spec §10.6), from chain events.
import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Gavel, Lock, ScrollText, Vote } from "lucide-react";
import { Skeleton, Tooltip, cn } from "../../components/ui";
import { useEvents } from "../../hooks/useEvents";
import { useOrg } from "../../hooks/useOrg";
import { fmtTime, shortHash } from "../../lib/format";
import { useHealth } from "../../hooks/useHealth";
import { policyLabel } from "../../lib/policy";
import { buildHistory, type HistoryItem, type HistoryKind } from "./councilHistory";

const LOOK: Record<HistoryKind, { icon: typeof Lock; ring: string; chip: string }> = {
  tighten: { icon: Lock, ring: "border-warn/60 bg-warn-soft text-warn", chip: "bg-warn-soft text-warn" },
  loosen: { icon: Gavel, ring: "border-ok/50 bg-ok-soft text-ok", chip: "bg-ok-soft text-ok" },
  propose: { icon: ScrollText, ring: "border-brand/50 bg-brand-soft text-[#c9c2ff]", chip: "bg-brand-soft text-[#c9c2ff]" },
  vote: { icon: Vote, ring: "border-ok/35 bg-white/5 text-ok", chip: "bg-white/8 text-muted" },
};

function Item({ it, last }: { it: HistoryItem; last: boolean }) {
  const { icon: Icon, ring, chip } = LOOK[it.kind];
  return (
    <motion.li layout initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} className="relative flex gap-3 pb-3" data-kind={it.kind}>
      {!last ? <span aria-hidden className="absolute bottom-0 left-[15px] top-8 w-px bg-line-strong" /> : null}
      <span className={cn("z-10 grid size-8 shrink-0 place-items-center rounded-full border", ring)}><Icon className="size-4" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="text-[13.5px] font-semibold text-text">{it.title}</p>
          <span className={cn("rounded-full px-2 py-px text-[10.5px] font-semibold", chip)}>{it.rule}</span>
          {it.policyVersion ? <span className="rounded-full bg-brand-soft px-2 py-px text-[10.5px] font-semibold text-[#c9c2ff]">→ policy v{it.policyVersion}</span> : null}
          <time className="ml-auto text-[11px] text-faint" dateTime={it.ts}>{fmtTime(it.ts)}</time>
        </div>
        {it.detail ? <p className="mt-0.5 text-[12px] leading-snug text-muted">{it.detail}</p> : null}
        <Tooltip content={<span className="font-mono">{it.txHash}{it.simulated ? <><br /><span className="font-sans text-faint">Giao dịch mô phỏng.</span></> : null}</span>}>
          <span tabIndex={0} className="mt-0.5 inline-block font-mono text-[10.5px] text-faint">{it.simulated ? "◇ mô phỏng " : ""}{shortHash(it.txHash, 8, 6)}</span>
        </Tooltip>
      </div>
    </motion.li>
  );
}

export function ActionHistory() {
  const { data: events, isLoading } = useEvents();
  const { data: org } = useOrg();
  const { data: health } = useHealth();
  const offset = health ? health.policyVersion - (policyLabel(health) ?? health.policyVersion) : 0;
  const items = useMemo(() => buildHistory(events ?? [], org?.council.members ?? [], offset), [events, org, offset]);
  return (
    <section aria-labelledby="hist-title" className="glass flex min-h-0 flex-1 flex-col rounded-[var(--radius-lg)] p-4" data-tour="council-history">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="hist-title" className="text-[12px] font-semibold uppercase tracking-wider text-faint">Lịch sử hành động của Hội đồng</h2>
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="rounded-full bg-warn-soft px-2 py-0.5 font-semibold text-warn">siết · 1 người</span>
          <span className="rounded-full bg-ok-soft px-2 py-0.5 font-semibold text-ok">nới · 2/3</span>
        </div>
      </div>
      {isLoading ? <Skeleton className="h-40 rounded-md" /> : items.length === 0 ? (
        <div className="grid flex-1 place-items-center rounded-[var(--radius-md)] border border-dashed border-line-strong px-6 text-center">
          <div><p className="text-[14px] font-semibold text-muted">Hội đồng chưa có hành động nào</p><p className="mt-1 text-[12.5px] text-faint">Khoá khu, dừng kho, đề xuất và phiếu duyệt sẽ hiện ở đây, lấy từ sự kiện trên chain.</p></div>
        </div>
      ) : (
        <ol className="min-h-0 flex-1 overflow-y-auto pr-1" aria-label="Lịch sử hành động">
          <AnimatePresence initial={false}>{items.map((it, i) => <Item key={it.id} it={it} last={i === items.length - 1} />)}</AnimatePresence>
        </ol>
      )}
    </section>
  );
}
