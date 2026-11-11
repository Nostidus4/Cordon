// Proposal warnings: conflict of interest (who + why), concentration, declared data (spec §6.5, §8.5 R4).
import { motion } from "framer-motion";
import { AlertOctagon, Database, Scale } from "lucide-react";
import { cn } from "../../components/ui";
import type { Proposal } from "../../types";
import { MEMBER_FULL } from "./logic";

const META = {
  CONFLICT_OF_INTEREST: { Icon: AlertOctagon, title: "Xung đột lợi ích", tone: "border-bad/55 bg-bad-soft text-bad", code: "CONFLICT_OF_INTEREST" },
  CONCENTRATION: { Icon: Scale, title: "Dồn quyền (R4)", tone: "border-warn/50 bg-warn-soft text-warn", code: "R4_COUNCIL_CONCENTRATION" },
  DATA_DECLARED: { Icon: Database, title: "Dữ liệu tự khai", tone: "border-line-strong bg-white/5 text-muted", code: "DATA_DECLARED" },
} as const;

export function Warnings({ proposal, className }: { proposal: Pick<Proposal, "warnings" | "conflictedMembers">; className?: string }) {
  if (!proposal.warnings.length) return null;
  const who = proposal.conflictedMembers.map((m) => MEMBER_FULL[m]).join(", ");
  return (
    <div className={cn("space-y-2", className)} data-tour="req-conflict">
      {proposal.warnings.map((w, i) => {
        const m = META[w.code];
        return (
          <motion.div key={i} role="alert" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 * i }}
            className={cn("flex items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3", m.tone, w.code === "CONFLICT_OF_INTEREST" && "alarm")}>
            <m.Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div className="min-w-0 text-[13.5px] leading-snug">
              <p className="flex flex-wrap items-center gap-2 font-bold">
                <span><span aria-hidden>{w.code === "DATA_DECLARED" ? "●" : "▲"}</span> {m.title}</span>
                <code className="rounded bg-black/25 px-1.5 py-0.5 font-mono text-[10.5px] font-medium opacity-90">{m.code}</code>
                {w.code === "CONFLICT_OF_INTEREST" && who ? <span className="rounded-full bg-bad/20 px-2 py-0.5 text-[11px]">bị chặn duyệt: {who}</span> : null}
              </p>
              <p className="mt-1 text-text/90">{w.text}</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
