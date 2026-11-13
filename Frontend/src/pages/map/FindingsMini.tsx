// Mini findings panel (top-left of the map): open findings with "Tạo đề xuất sửa".
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ShieldAlert, ShieldCheck, Wand2 } from "lucide-react";
import { Button, StatusChip, cn } from "../../components/ui";
import type { Finding } from "../../types";

const SEV: Record<Finding["severity"], { status: "bad" | "warn" | "info"; text: string }> = { HIGH: { status: "warn", text: "Cao" }, MEDIUM: { status: "warn", text: "Vừa" }, LOW: { status: "info", text: "Thấp" } };

export function FindingsMini({ findings, drafting, onDraft, onFocus, collapsed: forceCollapsed, className }: {
  collapsed?: boolean; findings: Finding[]; drafting: string | null; onDraft: (f: Finding) => void; onFocus: (f: Finding) => void; className?: string;
}) {
  const open = findings;
  const [manual, setCollapsed] = useState(false);
  const collapsed = manual || !!forceCollapsed;
  return (
    <section aria-label="Phát hiện rủi ro" className={cn("glass w-[330px] rounded-2xl", open.length ? "border-warn/35" : "border-ok/30", className)}>
      <button type="button" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed} className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left">
        <span className={cn("grid size-7 place-items-center rounded-lg", open.length ? "bg-warn-soft text-warn" : "bg-ok-soft text-ok")}>{open.length ? <ShieldAlert className="size-4" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}</span>
        <span className="flex-1 text-[13.5px] font-semibold text-text">{open.length ? `${open.length} phát hiện đang mở` : "Không có phát hiện nào đang mở"}</span>
        {open.length ? <ChevronDown className={cn("size-4 text-faint transition-transform", collapsed && "-rotate-90")} aria-hidden /> : <span aria-hidden className="font-bold text-ok">✓</span>}
      </button>
      <AnimatePresence initial={false}>
        {!collapsed && open.length ? (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="max-h-[300px] space-y-2 overflow-y-auto px-3 pb-3">
            {open.map((f) => (
              <li key={f.id} className="rounded-xl border border-line bg-white/4 p-3">
                <div className="mb-1.5 flex items-center gap-2"><StatusChip status={SEV[f.severity].status} size="sm">Mức {SEV[f.severity].text}</StatusChip></div>
                <button type="button" onClick={() => onFocus(f)} className="mb-2.5 block text-left text-[13px] font-semibold leading-snug text-text underline-offset-2 hover:underline">{f.title}</button>
                <Button size="sm" variant="primary" icon={<Wand2 className="size-3.5" />} loading={drafting === f.id} onClick={() => onDraft(f)}>Tạo đề xuất sửa</Button>
              </li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
