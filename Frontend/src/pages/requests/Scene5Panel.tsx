// Scene 5 (spec §4.4, F1/F2): linked request, Huy question for the assistant, council-owned district alternative.
import { motion } from "framer-motion";
import { ArrowRight, Building, Link2, Landmark } from "lucide-react";
import { Button, Card, CardHeader, StatusChip } from "../../components/ui";
import { toBase } from "../../lib/format";
import type { Proposal, ProposedChange } from "../../types";
import { RequestAssistant } from "./AssistantSlot";
import { BeforeAfterInline } from "./BeforeAfter";

export const COUNCIL_DISTRICT_CHANGE: ProposedChange = { kind: "council_district", id: "council_ops", keys: ["key_agent_rebalance"], capRaw: toBase(100000).toString() };
export const isScene5 = (p: Pick<Proposal, "id">) => p.id === 12 || p.id === 13;

export function Scene5Panel({ proposal, linked, onOpen, onDraft, treasury }: {
  proposal: Proposal; linked: Proposal | undefined; onOpen: (id: number) => void; onDraft: (c: ProposedChange) => void; treasury?: bigint;
}) {
  const conflictProposal = proposal.id === 13 ? proposal : linked;
  return (
    <div className="space-y-4">
      {linked ? (
        <Card padded={false} className="p-4" tone={linked.conflictedMembers.length ? "bad" : "default"}>
          <CardHeader className="mb-2" title={<span className="inline-flex items-center gap-2"><Link2 className="size-4 text-brand" aria-hidden /> Đơn đi kèm #{linked.id}</span>} en="cùng gói xin quyền cho khu anh Minh / Huy" />
          <p className="text-[13.5px] leading-snug text-text">{linked.title}</p>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <BeforeAfterInline report={linked} treasury={treasury} />
            {linked.conflictedMembers.length ? <StatusChip status="bad" size="sm">xung đột lợi ích</StatusChip> : null}
          </div>
          <Button size="sm" variant="ghost" className="mt-2 -ml-2" onClick={() => onOpen(linked.id)} icon={<ArrowRight className="size-3.5" />}>Mở đơn #{linked.id}</Button>
        </Card>
      ) : null}

      <Card padded={false} className="p-4" data-tour="req-assistant-card">
        <CardHeader className="mb-3" title="Trợ lý rủi ro" en="câu hỏi cố định · số lấy từ API" />
        <RequestAssistant proposalId={conflictProposal?.id ?? proposal.id} onSuggestion={(c) => onDraft(c)} />
      </Card>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="relative overflow-hidden rounded-[var(--radius-lg)] border border-ok/40 bg-[linear-gradient(160deg,rgb(52_224_180/0.12),rgb(76_201_240/0.04)_60%,transparent)] p-4" data-tour="req-alternative">
        <div className="mb-2 flex items-center gap-2 text-ok"><Landmark className="size-4" aria-hidden /><span className="text-[11px] font-bold uppercase tracking-[0.14em]">Phương án thay thế</span></div>
        <h3 className="text-[15px] font-bold leading-snug text-text">Lập khu do Hội đồng sở hữu</h3>
        <p className="mt-1 text-[13px] leading-snug text-muted">Trợ lý Cân đối chạy trong một khu riêng của Hội đồng, không đi qua phiếu duyệt của anh Huy.</p>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[["Hạn mức", "100.000/ngày"], ["Sàn", "chỉ DEX đã duyệt"], ["Chủ khu", "Hội đồng"]].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-ok/25 bg-black/20 px-2 py-2"><dt className="text-[10.5px] uppercase tracking-wider text-faint">{k}</dt><dd className="tnum mt-0.5 text-[13px] font-bold text-ok">{v}</dd></div>
          ))}
        </dl>
        <Button size="sm" variant="success" className="mt-3" icon={<Building className="size-4" />} onClick={() => onDraft(COUNCIL_DISTRICT_CHANGE)}>Soạn đề xuất khu Hội đồng</Button>
      </motion.div>
    </div>
  );
}
