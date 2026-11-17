// Scene 5 extras on proposals #12 / #13: the linked request, the fixed-question assistant, the council-owned district alternative.
import { useState } from "react";
import { useDistrict } from "../../../hooks/useDistrict";
import { beforeAfter } from "../../../shared/requests/logic";
import { AssistantBubble } from "../../../stage/parts";
import { ToyButton } from "../../../stage/ui";
import type { Proposal, ProposedChange } from "../../../types";
import { councilDistrictChange } from "../proposals.logic";

export function Scene5Side({ proposal, linked, onOpen, onDraft, treasury }: {
  proposal: Proposal; linked: Proposal | undefined; onOpen: (id: number) => void; onDraft: (c: ProposedChange) => void; treasury?: bigint;
}) {
  const conflictProposal = proposal.id === 13 ? proposal : linked;
  // the backend takes key addresses, not seed ids
  const rebalanceKey = useDistrict("agent_rebalance").data?.keys[0]?.address ?? "key_agent_rebalance";
  const [suggested, setSuggested] = useState<{ title: string; change: ProposedChange }[]>([]);
  const lb = linked ? beforeAfter(linked, treasury).estimated : null;
  return (
    <div className="grid gap-3.5" style={{ minWidth: 0 }}>
      {linked && lb ? (
        <div className="px-card" data-tone={linked.conflictedMembers.length ? "bad" : undefined}>
          <h3 className="px-h" style={{ marginBottom: 4 }}>Đơn đi kèm #{linked.id}</h3>
          <p style={{ margin: 0, fontWeight: 600, lineHeight: 1.35 }}>{linked.title}</p>
          <p className="tnum" style={{ margin: "6px 0 0", fontWeight: 700 }}>{lb.beforeDisplay} → <span style={{ color: "var(--red-ink)" }}>{lb.afterDisplay}</span> <span className="px-label">· quỹ chính {lb.beforePctText} → {lb.afterPctText}</span></p>
          {linked.conflictedMembers.length ? <p style={{ margin: "4px 0 0", color: "var(--red-ink)", fontWeight: 700, fontSize: 12.5 }}>✕ Có thành viên xung đột lợi ích</p> : null}
          <ToyButton size="xs" color="cream" onClick={() => onOpen(linked.id)} style={{ marginTop: 8 }}>Mở đơn #{linked.id}</ToyButton>
        </div>
      ) : null}

      <div className="px-card" data-tour="sys-assistant">
        <AssistantBubble questionIds={["give_agent_huy"]} screen="requests" principalIds={["huy"]} proposalId={conflictProposal?.id ?? proposal.id}
          onAnswer={(a) => setSuggested(a.suggestions ?? [])} />
        {suggested.map((s, i) => <ToyButton key={i} size="xs" color="violet" style={{ marginTop: 8 }} onClick={() => onDraft(s.change)}>Soạn đề xuất: {s.title}</ToyButton>)}
      </div>

      <div className="px-card" data-tone="ok" data-tour="sys-alternative">
        <div className="px-label" style={{ color: "var(--ok-ink)" }}>Phương án thay thế</div>
        <h3 className="px-h" style={{ margin: "2px 0 4px" }}>Lập khu do Hội đồng sở hữu</h3>
        <p style={{ margin: 0, fontSize: 13, color: "var(--ink-2)", lineHeight: 1.4 }}>Trợ lý Cân đối chạy trong một khu riêng của Hội đồng, không đi qua phiếu duyệt của anh Huy.</p>
        <div className="mt-2.5 grid grid-cols-3 gap-2 text-center">
          {[["Hạn mức", "100.000/ngày"], ["Sàn", "DEX đã duyệt"], ["Chủ khu", "Hội đồng"]].map(([k, v]) => (
            <div key={k} className="sx-tile" data-tone="ok"><span className="k">{k}</span><span className="v sm">{v}</span></div>
          ))}
        </div>
        <ToyButton size="xs" color="green" style={{ marginTop: 10 }} onClick={() => onDraft(councilDistrictChange(rebalanceKey))}>Soạn đề xuất khu Hội đồng</ToyButton>
      </div>
    </div>
  );
}
