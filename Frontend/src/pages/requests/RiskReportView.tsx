// Risk report (spec §8.5): findings before -> after + conflict flag + hash.
import { motion } from "framer-motion";
import { ArrowRight, CircleCheck, FileSearch } from "lucide-react";
import { StatusChip, cn } from "../../components/ui";
import type { Finding, RiskReport } from "../../types";
import { RiskHashChip } from "./RiskHashChip";

const sev = { HIGH: "bad", MEDIUM: "warn", LOW: "info" } as const;
const List = ({ items, empty }: { items: Finding[]; empty: string }) => (
  <ul className="space-y-1.5">
    {items.length ? items.map((f) => (
      <li key={f.id} className="flex items-start gap-2 rounded-lg border border-line bg-white/[0.025] px-2.5 py-2 text-[12.5px] leading-snug">
        <StatusChip size="sm" status={sev[f.severity]}>{f.severity}</StatusChip>
        <span className="min-w-0 text-text"><code className="mr-1 font-mono text-[10.5px] text-faint">{f.ruleId.split("_")[0]}</code>{f.title}</span>
      </li>
    )) : <li className="flex items-center gap-2 rounded-lg border border-ok/30 bg-ok-soft px-2.5 py-2 text-[12.5px] font-semibold text-ok"><CircleCheck className="size-4" aria-hidden /> {empty}</li>}
  </ul>
);

export function RiskReportView({ report, hash, className }: { report: RiskReport; hash?: string; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("rounded-[var(--radius-md)] border border-line bg-white/[0.02] p-4", className)} data-tour="req-risk-report">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-faint"><FileSearch className="size-3.5" aria-hidden /> Báo cáo rủi ro · đồ thị v{report.graphVersion}</p>
        <RiskHashChip report={report} hash={hash} />
      </div>
      <div className="grid items-start gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div><p className="mb-1.5 text-xs font-semibold text-muted">Phát hiện trước</p><List items={report.findingsBefore} empty="Không có phát hiện" /></div>
        <ArrowRight className="mt-7 hidden size-5 text-faint md:block" aria-hidden />
        <div><p className="mb-1.5 text-xs font-semibold text-muted">Phát hiện sau</p><List items={report.findingsAfter} empty="Không còn phát hiện nào" /></div>
      </div>
      {report.conflictOfInterest ? <p className="mt-3 text-xs font-semibold text-bad">✕ Cờ xung đột lợi ích: bật</p> : null}
    </motion.div>
  );
}
