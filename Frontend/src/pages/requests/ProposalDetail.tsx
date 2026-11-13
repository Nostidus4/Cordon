// Detail view of one proposal (spec §10.4): header, before/after, plain-words changes, warnings, approvals, execution animation.
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CalendarClock, Layers, PenLine } from "lucide-react";
import { Card, CardHeader, cn } from "../../components/ui";
import { useGraph } from "../../hooks/useGraph";
import { policyLabel } from "../../lib/policy";
import type { CouncilMember, MemberId, Proposal, ProposedChange } from "../../types";
import { ApproveButtons } from "./ApproveButtons";
import { BeforeAfter } from "./BeforeAfter";
import { CallsInPlainWords } from "./CallsInPlainWords";
import { ExecutedBanner, ExecutionBurst } from "./ExecutionSeal";
import { MEMBER_FULL, changeKindLabel, isRiskIncrease } from "./logic";
import { RiskHashChip } from "./RiskHashChip";
import { RiskReportView } from "./RiskReportView";
import { Scene5Panel, isScene5 } from "./Scene5Panel";
import { Warnings } from "./Warnings";

export function ProposalDetail({ proposal, all, members, demoMode, pendingMember, onApprove, onOpen, onDraft, treasury }: {
  proposal: Proposal; all: Proposal[]; members: CouncilMember[]; demoMode: boolean; pendingMember: MemberId | null;
  onApprove: (m: MemberId) => void; onOpen: (id: number) => void; onDraft: (c: ProposedChange) => void; treasury?: bigint;
}) {
  // The backend does not store the resulting version per proposal; show the live one.
  const version = policyLabel(useGraph().data) ?? null;
  // open -> executed transition (while viewing) plays the seal + toast once
  const prev = useRef<{ id: number; status: Proposal["status"] }>({ id: proposal.id, status: proposal.status });
  const [burst, setBurst] = useState(false);
  useEffect(() => {
    const p = prev.current;
    if (p.id === proposal.id && p.status === "open" && proposal.status === "executed") {
      setBurst(true);
      const t = setTimeout(() => setBurst(false), 2600);
      prev.current = { id: proposal.id, status: proposal.status };
      return () => clearTimeout(t);
    }
    prev.current = { id: proposal.id, status: proposal.status };
  }, [proposal.id, proposal.status]);

  const executed = proposal.status === "executed";
  const linked = isScene5(proposal) ? all.find((p) => p.id === (proposal.id === 12 ? 13 : 12)) : undefined;
  const scene5 = isScene5(proposal);

  return (
    <div className={cn("grid items-start gap-5", scene5 ? "xl:grid-cols-[minmax(0,1fr)_400px]" : "")}>
      <div className="relative min-w-0 space-y-4">
        <Card className="relative" strong tone={proposal.conflictedMembers.length && !executed ? "bad" : executed ? "ok" : "brand"}>
          <ExecutionBurst show={burst} version={version} />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono font-bold text-text">Đề xuất #{proposal.id}</span>
            <span className="rounded-md bg-brand-soft px-2 py-0.5 font-semibold text-[#c9c2ff]">{proposal.change ? changeKindLabel[proposal.change.kind] : "Khác"}</span>
            {isRiskIncrease(proposal) ? <span className="rounded-md bg-bad-soft px-2 py-0.5 font-semibold text-bad">▲ xin thêm quyền</span> : <span className="rounded-md bg-ok-soft px-2 py-0.5 font-semibold text-ok">▼ thu hẹp rủi ro</span>}
            <span className="ml-auto"><RiskHashChip report={proposal.riskReport} hash={proposal.riskReportHash} /></span>
          </div>
          <h2 className="mt-3 text-[22px] font-bold leading-tight tracking-tight text-text">{proposal.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5"><Layers className="size-3.5 text-faint" aria-hidden /> Khu bị ảnh hưởng: <b className="text-text">{proposal.subjectPrincipal ?? "chung"}</b></span>
            <span className="inline-flex items-center gap-1.5"><PenLine className="size-3.5 text-faint" aria-hidden /> Người đề xuất: <b className="text-text">{MEMBER_FULL[proposal.proposer]}</b></span>
            <span className="inline-flex items-center gap-1.5"><CalendarClock className="size-3.5 text-faint" aria-hidden /> {new Date(proposal.createdAt * 1000).toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span>
          </div>
          {executed ? <ExecutedBanner className="mt-4" version={version} at={proposal.executedAt} /> : null}
        </Card>

        <Warnings proposal={proposal} />
        <BeforeAfter report={proposal} treasury={treasury} />

        <Card>
          <CardHeader title="Thay đổi bằng lời thường" en="dịch từ calls[] sẽ gửi lên contract" />
          <CallsInPlainWords calls={proposal.calls} describe={proposal.descriptionVi} />
        </Card>

        <Card strong>
          <ApproveButtons proposal={proposal} members={members} demoMode={demoMode} pendingMember={pendingMember} onApprove={onApprove} />
        </Card>

        <RiskReportView report={proposal.riskReport} hash={proposal.riskReportHash} />
      </div>

      {scene5 ? (
        <motion.aside initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} className="min-w-0" aria-label="Cảnh 5: xin thêm quyền">
          <Scene5Panel proposal={proposal} linked={linked} onOpen={onOpen} onDraft={onDraft} treasury={treasury} />
        </motion.aside>
      ) : null}
    </div>
  );
}
