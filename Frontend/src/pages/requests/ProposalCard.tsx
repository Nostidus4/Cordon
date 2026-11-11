// List card: title, district, before -> after, status, tiny approval pips (spec §10.4).
import { motion } from "framer-motion";
import { AlertOctagon, CheckCheck, Clock3 } from "lucide-react";
import { cn } from "../../components/ui";
import type { Proposal } from "../../types";
import { BeforeAfterInline } from "./BeforeAfter";
import { MEMBER_ORDER, MEMBER_SHORT, changeKindLabel } from "./logic";

export function ProposalCard({ p, selected, onSelect, treasury, index }: { p: Proposal; selected: boolean; onSelect: () => void; treasury?: bigint; index: number }) {
  const conflict = p.conflictedMembers.length > 0;
  const executed = p.status === "executed";
  return (
    <motion.button layout type="button" onClick={onSelect} aria-pressed={selected} data-proposal-id={p.id}
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06 }}
      className={cn("glass relative w-full overflow-hidden rounded-[var(--radius-lg)] p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong",
        selected && "border-brand/70 bg-glass-strong shadow-[var(--shadow-glow-brand)]", executed && !selected && "opacity-80")}>
      {selected ? <span className="absolute inset-y-0 left-0 w-1 bg-[image:var(--brand-gradient)]" aria-hidden /> : null}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-white/8 px-1.5 py-0.5 font-mono text-xs font-bold text-muted">#{p.id}</span>
          <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold text-[#c9c2ff]">{changeKindLabel[p.change.kind]}</span>
        </div>
        {executed ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-ok"><CheckCheck className="size-3.5" aria-hidden /> policy v{p.resultingPolicyVersion}</span>
          : <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-warn"><Clock3 className="size-3.5" aria-hidden /> đang chờ duyệt</span>}
      </div>
      <h3 className="mt-2.5 text-[14.5px] font-semibold leading-snug text-text">{p.title}</h3>
      <p className="mt-1 text-xs text-faint">Khu bị ảnh hưởng: <b className="font-semibold text-muted">{p.subjectPrincipal ?? "chung"}</b></p>
      <div className="mt-3"><BeforeAfterInline report={p} treasury={treasury} /></div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {MEMBER_ORDER.map((m) => {
            const ok = p.approvals.some((a) => a.member === m), cf = p.conflictedMembers.includes(m) && !ok;
            return <span key={m} title={`${MEMBER_SHORT[m]}: ${ok ? "đã duyệt" : cf ? "xung đột lợi ích" : "chưa duyệt"}`}
              className={cn("grid size-6 place-items-center rounded-full border text-[10px] font-bold", ok ? "border-ok bg-ok/20 text-ok" : cf ? "border-bad bg-bad/15 text-bad" : "border-dashed border-line-strong text-faint")}>
              {ok ? "✓" : cf ? "✕" : MEMBER_SHORT[m][0]}</span>;
          })}
          <span className="tnum ml-1 text-[11px] text-faint">{p.approvals.length}/{p.threshold}</span>
        </div>
        {conflict && !executed ? <span className="inline-flex items-center gap-1 rounded-full border border-bad/45 bg-bad-soft px-2 py-0.5 text-[11px] font-semibold text-bad"><AlertOctagon className="size-3" aria-hidden /> xung đột lợi ích</span> : null}
      </div>
    </motion.button>
  );
}
