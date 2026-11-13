// 3 approval slots (Trang/Lan/Huy) + 'Duyệt với tư cách …' buttons in demoMode; conflicted member is DISABLED with reason (spec §10.4, F2).
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, Check, Hourglass, Pen, ShieldX, UserRound } from "lucide-react";
import { Button, Tooltip, cn } from "../../components/ui";
import { ApiError, api } from "../../lib/api";
import type { CouncilMember, MemberId, Proposal } from "../../types";
import { MEMBER_SHORT, approvalSlots, type ApprovalSlot } from "./logic";

function Slot({ s, proposer, idx }: { s: ApprovalSlot; proposer: boolean; idx: number }) {
  const approved = s.state === "approved", conflict = s.state === "conflict";
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.07 }}
      data-member={s.member} data-state={s.state}
      className={cn("relative flex flex-1 flex-col items-center gap-2 overflow-hidden rounded-[var(--radius-md)] border px-3 py-4 text-center transition-colors",
        approved && "border-ok/50 bg-ok-soft", conflict && "border-bad/45 bg-bad-soft", s.state === "pending" && "border-dashed border-line-strong bg-white/[0.025]")}>
      {conflict ? <div className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_7px,rgb(255_107_122/0.07)_7px_14px)]" aria-hidden /> : null}
      <div className={cn("relative grid size-14 place-items-center rounded-full border-2",
        approved ? "border-ok bg-ok/20 text-ok" : conflict ? "border-bad bg-bad/15 text-bad" : "border-line-strong bg-white/5 text-faint")}>
        <AnimatePresence mode="wait" initial={false}>
          {approved ? <motion.span key="a" initial={{ scale: 0, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 16 }}><Check className="size-7" strokeWidth={3} aria-hidden /></motion.span>
            : conflict ? <motion.span key="c" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}><ShieldX className="size-6" aria-hidden /></motion.span>
            : <motion.span key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }}><UserRound className="size-6" aria-hidden /></motion.span>}
        </AnimatePresence>
        {approved ? <span className="absolute inset-[-5px] animate-ping rounded-full border border-ok/50 [animation-iteration-count:2]" aria-hidden /> : null}
      </div>
      <div className="relative">
        <p className="text-sm font-semibold text-text">{s.label}</p>
        <p className={cn("mt-0.5 text-xs font-semibold", approved ? "text-ok" : conflict ? "text-bad" : "text-faint")}>
          {approved ? <>✓ Đã duyệt</>
            : conflict ? "✕ Xung đột lợi ích" : <><Hourglass className="mr-1 inline size-3" aria-hidden />Chưa duyệt</>}
        </p>
        {proposer ? <p className="mt-1 inline-flex items-center gap-1 rounded bg-white/8 px-1.5 py-0.5 text-[10.5px] text-muted"><Pen className="size-2.5" aria-hidden /> người đề xuất</p> : null}
      </div>
    </motion.div>
  );
}

export function ApproveButtons({ proposal, members, demoMode, pendingMember, onApprove }: {
  proposal: Proposal; members: Pick<CouncilMember, "id" | "label">[]; demoMode: boolean; pendingMember: MemberId | null; onApprove: (m: MemberId) => void;
}) {
  const slots = approvalSlots(proposal, members);
  const have = proposal.approvals.length, need = proposal.threshold;
  const [bypass, setBypass] = useState<{ member: MemberId; code: string; message: string } | null>(null);
  const conflicted = slots.filter((s) => s.state === "conflict");

  const tryDirect = async (m: MemberId) => {
    try { await api.approveProposal(proposal.id, m); }
    catch (e) { setBypass({ member: m, code: e instanceof ApiError ? e.code : "ERROR", message: e instanceof Error ? e.message : String(e) }); }
  };

  return (
    <div data-tour="req-approvals">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-faint">Duyệt {need}/3 Hội đồng</p>
        <div className="flex items-center gap-2" aria-label={`${have} trên ${need} phiếu`}>
          {Array.from({ length: need }).map((_, i) => (
            <motion.span key={i} animate={{ scale: i < have ? [1, 1.4, 1] : 1 }} className={cn("h-2 w-9 rounded-full", i < have ? "bg-ok shadow-[0_0_10px_var(--color-ok)]" : "bg-white/12")} />
          ))}
          <span className="tnum text-xs font-semibold text-muted">{have}/{need} phiếu</span>
        </div>
      </div>
      <div className="flex gap-3">{slots.map((s, i) => <Slot key={s.member} s={s} idx={i} proposer={proposal.proposer === s.member} />)}</div>

      {demoMode ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-line bg-white/[0.02] p-3" data-tour="req-approve-buttons">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-faint">Chế độ demo · đóng vai Hội đồng</p>
          <div className="flex flex-wrap gap-2">
            {slots.map((s) => (
              <div key={s.member} className="flex flex-col items-start gap-1" data-tour={`req-approve-${s.member}`}>
                <Tooltip content={s.disabledReason ? <span className="block max-w-72">{s.disabledReason}</span> : `Ký phiếu duyệt bằng ví ${s.label}`}>
                  <span tabIndex={s.canApprove ? -1 : 0} aria-disabled={!s.canApprove} className="inline-flex">
                    <Button size="md" className="px-3.5 text-[13px]" variant={s.state === "conflict" ? "secondary" : "success"} disabled={!s.canApprove} disabledReason={s.disabledReason}
                      loading={pendingMember === s.member} icon={s.state === "conflict" ? <Ban className="size-4" /> : s.state === "approved" ? <Check className="size-4" /> : undefined}
                      onClick={() => onApprove(s.member)}>
                      Duyệt với tư cách {MEMBER_SHORT[s.member]}
                    </Button>
                  </span>
                </Tooltip>
                {s.state === "conflict" ? <span className="max-w-[230px] text-[11.5px] leading-snug text-bad">✕ {s.label} là chủ khu nhận thêm quyền</span> : null}
              </div>
            ))}
          </div>
          {conflicted.length && proposal.status === "open" ? (
            <div className="mt-3 border-t border-line pt-3">
              <button type="button" onClick={() => tryDirect(conflicted[0].member)} className="text-xs font-semibold text-faint underline decoration-dotted underline-offset-4 transition-colors hover:text-bad">
                Thử bỏ qua giao diện: gọi thẳng contract bằng ví {conflicted[0].label}
              </button>
              <AnimatePresence>
                {bypass ? (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="overflow-hidden">
                    <div role="alert" className="mt-2 rounded-lg border border-bad/50 bg-bad-soft px-3 py-2 font-mono text-xs text-bad">
                      <p className="font-semibold">✕ execution reverted: {bypass.code === "CONFLICT_OF_INTEREST" ? "ConflictOfInterest()" : bypass.code}</p>
                      <p className="mt-1 font-sans text-[12px] text-[#ffc2c9]">{bypass.message}</p>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          ) : null}
        </div>
      ) : proposal.status === "open" ? (
        <p className="mt-4 text-center text-xs text-faint">Chờ các thành viên Hội đồng ký bằng ví của họ.</p>
      ) : null}
    </div>
  );
}
