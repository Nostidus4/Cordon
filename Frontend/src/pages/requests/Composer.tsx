// 'Tạo đề xuất' composer for drafts coming from Simulate / findings / assistant suggestions (spec §10.3 -> §10.4, C1).
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Send, X } from "lucide-react";
import { Button, Card, Skeleton } from "../../components/ui";
import { api } from "../../lib/api";
import type { DraftProposalRequest, MemberId } from "../../types";
import { BeforeAfter } from "./BeforeAfter";
import { CallsInPlainWords } from "./CallsInPlainWords";
import { RiskReportView } from "./RiskReportView";
import { Warnings } from "./Warnings";
import { MEMBER_FULL } from "./logic";

export const PROPOSER: MemberId = "lan";

export function Composer({ req, sending, onSend, onCancel, treasury }: { req: DraftProposalRequest; sending: boolean; onSend: () => void; onCancel: () => void; treasury?: bigint }) {
  const q = useQuery({ queryKey: ["draft", req], queryFn: () => api.draftProposal(req), staleTime: 0, gcTime: 0 });
  const d = q.data;
  return (
    <div className="space-y-4" data-tour="req-composer">
      <Card strong tone="brand">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand">Tạo đề xuất · bản nháp</p>
            {d ? <h2 className="mt-1.5 text-[22px] font-bold leading-tight tracking-tight text-text">{d.title}</h2> : <Skeleton className="mt-2 h-7 w-3/4" />}
            <p className="mt-1.5 text-[13px] text-muted">Cordon đã chạy giả lập trước/sau. Xem báo cáo rủi ro, rồi gửi lên Hội đồng duyệt 2/3.</p>
          </div>
          <Button size="sm" variant="ghost" onClick={onCancel} icon={<X className="size-4" />}>Huỷ</Button>
        </div>
      </Card>
      {q.isError ? <div role="alert" className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-bad/50 bg-bad-soft px-4 py-3 text-sm text-bad"><span>✕ Không soạn được bản nháp. Có thể phát hiện này đã được xử lý.</span><Button size="sm" onClick={() => q.refetch()}>Thử lại</Button></div> : null}
      {!d && !q.isError ? <div className="space-y-3"><Skeleton className="h-48 w-full" /><Skeleton className="h-32 w-full" /></div> : null}
      {d ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <Warnings proposal={d} />
          <BeforeAfter report={d} treasury={treasury} />
          <Card><p className="mb-3 text-[15px] font-semibold text-text">Thay đổi bằng lời thường</p><CallsInPlainWords calls={d.calls} describe={d.descriptionVi} /></Card>
          <RiskReportView report={d.riskReport} hash={d.riskReportHash} />
          <div className="sticky bottom-12 z-10 flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-brand/50 bg-[#0d1236]/90 px-5 py-4 shadow-[var(--shadow-pop)] backdrop-blur-xl">
            <p className="text-[13px] text-muted">Người đề xuất: <b className="text-text">{MEMBER_FULL[PROPOSER]}</b> · cần {2}/3 phiếu để thực thi</p>
            <Button size="lg" variant="primary" loading={sending} onClick={onSend} icon={<Send className="size-4" />} data-tour="req-send">Gửi đề xuất (Lan đề xuất)</Button>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}
