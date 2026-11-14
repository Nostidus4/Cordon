// A fully approved proposal waiting out its timelock (#77): countdown + "Phủ quyết" (demo mode: any member may stop it).
import { useEffect, useState } from "react";
import { useActions } from "../hooks/useActions";
import { MEMBER_SHORT } from "../pages/requests/logic";
import type { MemberId, Proposal } from "../types";
import { countdownText } from "./timelock";
import { FaceAvatar, ToyButton } from "./ui";

export function QueuedBox({ proposal, demo }: { proposal: Proposal; demo: boolean }) {
  const actions = useActions();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  if (!proposal.queued || proposal.eta == null) return null;
  return (
    <div className="rounded-[14px] p-2.5" style={{ background: "var(--amber-soft)", border: "2px solid var(--amber)" }} data-queued={proposal.id}>
      <div className="font-toy text-[15px] font-bold" style={{ color: "var(--ink)" }}>Đề xuất #{proposal.id} đã đủ phiếu</div>
      <div className="text-[13.5px] font-bold" style={{ color: "var(--amber-ink)" }} data-countdown>{countdownText(proposal.eta, now)}</div>
      {demo ? (
        <div className="mt-2 flex gap-1.5" role="group" aria-label="Phủ quyết với tư cách thành viên Hội đồng">
          {proposal.members.map((m) => (
            <ToyButton key={m.id} size="xs" color="red" className="flex-1 !px-2" disabled={actions.veto.isPending}
              icon={<FaceAvatar member={m.id} size={22} />} onClick={() => actions.veto.mutate({ id: proposal.id, member: m.id as MemberId })}>
              Phủ quyết · {MEMBER_SHORT[m.id as MemberId]}
            </ToyButton>
          ))}
        </div>
      ) : null}
    </div>
  );
}
