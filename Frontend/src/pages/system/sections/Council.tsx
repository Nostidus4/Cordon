// Hội đồng: the principle, the proposals (list + one in full, with approvals / timelock / execution) and the Council's own history from chain events.
import { useMemo } from "react";
import "../ports.css";
import { useEvents } from "../../../hooks/useEvents";
import { useHealth } from "../../../hooks/useHealth";
import { useOrg } from "../../../hooks/useOrg";
import { useProposals } from "../../../hooks/useProposals";
import { fmtTime } from "../../../lib/format";
import { policyLabel } from "../../../lib/policy";
import { buildHistory, type HistoryKind } from "../../../shared/council/councilHistory";
import { ACCENT, Chip, Empty, Hash, Section } from "../ui";
import { Proposals } from "./Proposals";

const Principle = ({ big, k, d, c }: { big: string; k: string; d: string; c: string }) => (
  <div className="flex items-center gap-3">
    <span className="font-toy tnum" style={{ fontWeight: 800, fontSize: 40, color: c, lineHeight: 1, minWidth: 66 }}>{big}</span>
    <span><b className="font-toy" style={{ fontSize: 17 }}>{k}</b><span style={{ display: "block", fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.3 }}>{d}</span></span>
  </div>
);

const KIND: Record<HistoryKind, { t: "warn" | "ok" | "violet" | "grey"; text: string }> = {
  tighten: { t: "warn", text: "siết" }, loosen: { t: "ok", text: "nới" }, propose: { t: "violet", text: "đề xuất" }, vote: { t: "grey", text: "phiếu" },
};

function History() {
  const { data: events } = useEvents();
  const { data: org } = useOrg();
  const { data: health } = useHealth();
  const { data: proposals } = useProposals();
  const offset = health ? health.policyVersion - (policyLabel(health) ?? health.policyVersion) : 0;
  const items = useMemo(() => buildHistory(events ?? [], org?.council ?? [], offset, proposals ?? []), [events, org, offset, proposals]);
  return (
    <div className="mt-6" data-tour="sys-history">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="px-h" style={{ margin: 0 }}>Lịch sử hành động của Hội đồng</h3>
        <Chip t="warn">siết · 1 người</Chip><Chip t="ok">nới · 2/3</Chip>
      </div>
      {items.length === 0 ? <div className="mt-2"><Empty>Chưa có hành động nào. Khoá khu, dừng kho, đề xuất và phiếu duyệt sẽ hiện ở đây, lấy từ sự kiện trên chain.</Empty></div> : (
        <ul className="px-hist" aria-label="Lịch sử hành động">
          {items.slice(0, 40).map((it) => (
            <li key={it.id} data-kind={it.kind}>
              <Chip t={KIND[it.kind].t}>{KIND[it.kind].text}</Chip>
              <b>{it.title}</b>
              {it.policyVersion ? <Chip t="violet">→ chính sách v{it.policyVersion}</Chip> : null}
              {it.detail ? <span className="px-label" style={{ flexBasis: "100%", order: 3 }}>{it.detail}</span> : null}
              <span className="px-label" style={{ marginLeft: "auto" }}>{it.rule} · {fmtTime(it.ts)}</span>
              <Hash value={it.txHash} simulated={it.simulated} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Council() {
  return (
    <Section id="hoi-dong" accent={ACCENT.council} title="Hội đồng và đề xuất" sub="Siết thì một người là đủ, nới thì cần 2/3; trợ lý AI không có phiếu nào.">
      <div className="mb-5 flex flex-wrap gap-x-14 gap-y-3" aria-label="Nguyên tắc cốt lõi">
        <Principle big="1" k="Siết" d="khoá khu, dừng kho, hạ hạn mức" c="#e0364a" />
        <Principle big="2/3" k="Nới" d="mở khoá, tăng hạn mức, thêm thẻ" c={ACCENT.council} />
        <Principle big="0" k="AI" d="chỉ đọc, không ký, không chi tiền" c="#5e8fa3" />
      </div>
      <Proposals />
      <History />
    </Section>
  );
}
export default Council;
