// Right panel: role, caps, data source (on-chain vs "tự khai, chưa kiểm chứng"), allowed actions. Docked inside the canvas.
import { motion } from "framer-motion";
import { ArrowRight, Wand2, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { Button, CapBar, IconButton, Money, StatusChip, Tooltip, cn } from "../../components/ui";
import { KIND_ICON } from "../../components/graph/KeyNode";
import { useDistrict } from "../../hooks/useDistrict";
import { casual, KIND_LABEL, RELATION_LABEL } from "../../graph/names";
import { useUiStore } from "../../store/uiStore";
import { fmtDisplay } from "../../lib/format";
import { findingDetail } from "../../lib/findingText";
import type { Finding, GraphSnapshot } from "../../types";

export const PANEL_W = 384;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section><h4 className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-faint">{title}</h4>{children}</section>;
}
function OnChain({ children }: { children: ReactNode }) {
  return <div className="flex gap-2.5 rounded-xl border border-ok/30 bg-ok-soft px-3 py-2.5 text-[13px] leading-snug"><b aria-hidden className="text-ok">✓</b><span><b className="text-ok">Trên chain.</b> <span className="text-text/90">{children}</span></span></div>;
}
function Declared({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-dashed border-sim/60 bg-sim/10 px-3 py-2.5 text-[13px] leading-snug">
      <b aria-hidden className="text-sim">◇</b>
      <span>
        <b className="text-text">{title}</b> <Tooltip content="Do người dùng khai, chưa có giao dịch nào chứng minh. Guardian vẫn tính vào mức rủi ro ước tính."><span tabIndex={0} className="cursor-help rounded-full border border-dashed border-sim/60 px-1.5 text-[10.5px] font-semibold text-sim">tự khai, chưa kiểm chứng</span></Tooltip>
        {note ? <span className="mt-1 block text-[12px] italic text-muted">“{note}”</span> : null}
      </span>
    </div>
  );
}

export function NodeDetailPanel({ id, snapshot, findings, onSelect, onClose, onDraft, drafting }: {
  id: string; snapshot: GraphSnapshot; findings: Finding[]; onSelect: (id: string) => void; onClose: () => void;
  onDraft: (f: Finding) => void; drafting: boolean;
}) {
  const node = snapshot.nodes.find((n) => n.id === id);
  const isDistrict = id.startsWith("p:");
  const pid = isDistrict ? id.slice(2) : undefined;
  const district = pid ? snapshot.districts.find((d) => d.principalId === pid) : undefined;
  const { data: detail } = useDistrict(pid);
  const setSelected = useUiStore((s) => s.setSelectedPrincipals);
  const labelOfP = (p: string) => snapshot.districts.find((d) => d.principalId === p)?.label ?? p;

  let title = node?.label ?? district?.label ?? id, subtitle = "", icon: ReactNode = null, body: ReactNode = null;

  if (district) {
    const Icon = KIND_ICON[district.kind];
    icon = <Icon className="size-5" aria-hidden />;
    subtitle = `Khu · ${KIND_LABEL[district.kind]} · ${district.keys.length} thẻ`;
    const cap = district.dailyCap ? BigInt(district.dailyCap.raw) : null;
    const keyNodes = district.keys.map((k) => snapshot.nodes.find((n) => n.id === `k:${k}`)).filter(Boolean);
    const sumCaps = keyNodes.reduce((s, n) => s + BigInt(n!.data.keyDailyCap?.raw ?? "0"), 0n);
    const mine = findings.filter((f) => f.principalId === pid);
    const declared = (detail?.declaredEdges ?? []).filter((d) => d.from === pid);
    body = (
      <>
        <Section title="Hạn mức">
          {cap ? <p className="mb-2 flex items-center gap-1.5 text-[13px] text-ok"><b aria-hidden>✓</b> Hạn mức chung <b className="tnum">{district.dailyCap!.display}</b>/ngày, chain chặn cứng</p>
            : <p className="mb-2 text-[13px] text-warn"><b aria-hidden>▲</b> Không có cổng chung. Mỗi thẻ chi riêng, tổng có thể tới <b className="tnum">{fmtDisplay(sumCaps)}</b>/ngày.</p>}
          <CapBar label="Đã chi hôm nay" value={BigInt(district.spentToday.raw)} cap={cap ?? (sumCaps > 0n ? sumCaps : 1n)} locked={district.locked} />
          {detail ? <p className="mt-2 text-[12px] text-muted">Còn có thể chi: <Money value={detail.remaining} size="sm" /></p> : null}
        </Section>
        <Section title={`Thẻ trong khu (${district.keys.length})`}>
          <ul className="space-y-1.5">
            {keyNodes.map((n) => (
              <li key={n!.id}><button type="button" onClick={() => onSelect(n!.id)} className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-white/4 px-3 py-2 text-left text-[13px] transition-colors hover:border-brand/60 hover:bg-brand-soft">
                <span className="truncate text-text">{n!.label}</span><span className="tnum text-faint">{n!.data.keyDailyCap?.display}/ngày</span>
              </button></li>
            ))}
          </ul>
        </Section>
        <Section title="Nguồn dữ liệu">
          <div className="space-y-2">
            <OnChain>Thẻ nào thuộc khu này, hạn mức và số đã chi đều đọc từ chain.</OnChain>
            {declared.map((d) => <Declared key={d.to} title={`${RELATION_LABEL[d.relation]} ${(snapshot.nodes.find((n) => n.id === `p:${d.to}`) ?? snapshot.nodes.find((n) => n.id === `k:${d.to}`))?.label ?? d.to}`} note={d.note} />)}
            {declared.length === 0 ? <p className="text-[12.5px] text-muted">Khu này không khai quan hệ điều khiển nào khác.</p> : null}
          </div>
        </Section>
        {mine.length ? (
          <Section title="Phát hiện rủi ro">
            {mine.map((f) => (
              <div key={f.id} className="rounded-xl border border-warn/45 bg-warn-soft p-3">
                <p className="mb-1 text-[13px] font-semibold text-warn"><span aria-hidden>▲</span> {f.title}</p>
                <p className="mb-2.5 text-[12.5px] leading-snug text-text/85">{findingDetail(f)}</p>
                <Button size="sm" variant="primary" icon={<Wand2 className="size-3.5" />} loading={drafting} onClick={() => onDraft(f)}>Tạo đề xuất sửa</Button>
              </div>
            ))}
          </Section>
        ) : null}
        {district.kind === "HUMAN" ? (
          <Link to={`/simulate?p=${pid}`} onClick={() => setSelected([pid!])} className="flex items-center justify-between rounded-xl border border-brand/45 bg-brand-soft px-3.5 py-3 text-[13.5px] font-semibold text-text transition-colors hover:border-brand">
            Nếu {casual(district.label)} bị chiếm thì mất tối đa bao nhiêu? <ArrowRight className="size-4 shrink-0" aria-hidden />
          </Link>
        ) : null}
      </>
    );
  } else if (node?.type === "Key") {
    const ownerId = String(node.data.principalId ?? ""), owner = labelOfP(ownerId);
    const Icon = KIND_ICON[node.data.kind ?? "HUMAN"];
    icon = <Icon className="size-5" aria-hidden />;
    subtitle = `${KIND_LABEL[node.data.kind ?? "HUMAN"]} · thuộc khu ${owner}`;
    const capM = node.data.keyDailyCap, spentM = node.data.keySpentToday;
    const decl = snapshot.edges.filter((e) => e.to === id && e.source !== "onchain" && (e.type === "CONTROLS" || e.type === "ADMINS"));
    const pays = snapshot.edges.filter((e) => e.from === id && e.type === "MAY_PAY").map((e) => snapshot.nodes.find((n) => n.id === e.to)?.label ?? e.to);
    const calls = snapshot.edges.filter((e) => e.from === id && e.type === "MAY_CALL").map((e) => snapshot.nodes.find((n) => n.id === e.to)?.label ?? e.to);
    const dist = snapshot.districts.find((d) => d.principalId === ownerId);
    body = (
      <>
        <Section title="Vai trò & hạn mức">
          <p className="mb-2.5 text-[13px] text-muted">Thẻ {node.data.kind === "AGENT" ? "của trợ lý AI" : node.data.kind === "SERVICE" ? "của phần mềm" : "của một người"}, thuộc khu <b className="text-text">{owner}</b>.</p>
          {capM && spentM ? <CapBar label="Trần riêng của thẻ" value={BigInt(spentM.raw)} cap={BigInt(capM.raw)} locked={!!node.data.locked} /> : null}
          <p className={cn("mt-2.5 text-[12.5px]", dist?.dailyCap ? "text-ok" : "text-warn")}>{dist?.dailyCap ? `✓ Cùng chia hạn mức chung ${dist.dailyCap.display}/ngày của khu` : "▲ Khu này không có cổng chung, thẻ chỉ bị chặn bởi trần riêng"}</p>
        </Section>
        <Section title="Nguồn dữ liệu">
          <div className="space-y-2">
            {node.data.active !== false
              ? <OnChain>Chain xác nhận thẻ thuộc khu {owner} và đang trong danh sách được phép (Tx AllowList).</OnChain>
              : <div className="rounded-xl border border-lock/50 bg-lock-soft px-3 py-2.5 text-[13px] text-lock">◐ Thẻ đã bị gạch khỏi danh sách cho phép: node chain từ chối mọi giao dịch.</div>}
            {decl.map((e) => <Declared key={e.id} title={`${RELATION_LABEL[e.type as "CONTROLS" | "ADMINS"]}: ${casual(labelOfP(e.from.replace(/^p:/, "")))}`} />)}
          </div>
        </Section>
        <Section title="Được phép làm gì">
          <ul className="space-y-1.5 text-[13px] text-text/90">
            <li className="flex gap-2"><b aria-hidden className="text-ok">✓</b> Chi tiêu trong trần <b className="tnum">{capM?.display ?? "?"}</b>/ngày</li>
            {pays.length ? <li className="flex gap-2"><b aria-hidden className="text-ok">✓</b> Trả cho: {pays.join(", ")}</li> : null}
            {calls.length ? <li className="flex gap-2"><b aria-hidden className="text-ok">✓</b> Đổi token qua {calls.join(", ")}</li> : null}
            {node.data.kind === "HUMAN" && !pays.length ? <li className="flex gap-2 text-muted"><b aria-hidden>○</b> Chi thủ công, không có danh sách người nhận cố định</li> : null}
          </ul>
        </Section>
        <Link to={`/simulate?p=${decl[0] ? decl[0].from.replace(/^p:/, "") : ownerId}`} className="flex items-center justify-between rounded-xl border border-brand/45 bg-brand-soft px-3.5 py-3 text-[13.5px] font-semibold text-text transition-colors hover:border-brand">
          Giả lập khi {casual(labelOfP(decl[0] ? decl[0].from.replace(/^p:/, "") : ownerId))} bị chiếm <ArrowRight className="size-4 shrink-0" aria-hidden />
        </Link>
      </>
    );
  } else if (node) {
    const t = node.type;
    icon = <span className="text-[15px] font-bold">{t[0]}</span>;
    const desc: Record<string, string> = {
      Treasury: "Quỹ gốc của công ty, đa chữ ký Safe 3/5. AI không bao giờ chạm trực tiếp vào đây.",
      Vault: "Kho chi tiêu: nơi duy nhất các thẻ được rút tiền, luôn đi qua hạn mức.",
      Council: "Hội đồng 3 người, cần 2 phiếu duyệt để đổi hạn mức hay chuyển thẻ giữa các khu.",
      Member: "Thành viên Hội đồng, có quyền duyệt đề xuất thay đổi chính sách.",
      Recipient: "Nơi nhận tiền nằm trong danh sách trắng. Thẻ chỉ trả được cho các địa chỉ này.",
      Protocol: "Hợp đồng được phép gọi, ví dụ sàn đổi token mô phỏng.",
      Token: "Token được phép dùng trong Kho chi tiêu.",
    };
    subtitle = ({ Treasury: "Quỹ chính", Vault: "Kho chi tiêu", Council: "Hội đồng", Member: "Thành viên Hội đồng", Recipient: "Người nhận", Protocol: "Chợ", Token: "Token" } as Record<string, string>)[t] ?? t;
    body = (
      <>
        <Section title="Mô tả"><p className="text-[13.5px] leading-relaxed text-text/90">{desc[t]}</p></Section>
        {node.data.balance ? <Section title="Số dư"><Money value={node.data.balance} size="lg" unit="tUSDC" /></Section> : null}
        {t === "Member" && node.data.principalId ? <div className="rounded-xl border border-warn/45 bg-warn-soft px-3 py-2.5 text-[13px] text-warn"><b aria-hidden>▲</b> Thành viên này cũng giữ khu <b>{labelOfP(String(node.data.principalId))}</b>: xung đột lợi ích khi duyệt đề xuất cho chính khu mình.</div> : null}
        <Section title="Nguồn dữ liệu"><OnChain>Đọc từ chain.</OnChain></Section>
      </>
    );
  }

  return (
    <motion.aside
      initial={{ x: 48, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 48, opacity: 0 }} transition={{ type: "spring", stiffness: 340, damping: 34 }}
      style={{ width: PANEL_W }} className="glass absolute bottom-3 right-3 top-3 z-30 flex flex-col overflow-hidden rounded-2xl bg-glass-strong shadow-[var(--shadow-pop)]" aria-label={`Chi tiết ${title}`}
    >
      <header className="flex items-start gap-3 border-b border-line px-4 py-3.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-[#d6d1ff]">{icon}</span>
        <div className="min-w-0 flex-1 leading-tight"><h3 className="truncate text-[16px] font-bold text-text">{title}</h3><p className="mt-1 text-[12px] text-muted">{subtitle}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {district?.locked || node?.data.locked ? <StatusChip status="locked" size="sm">đã khoá</StatusChip> : null}
            {pid && findings.some((f) => f.principalId === pid) ? <StatusChip status="warn" size="sm">cờ vàng</StatusChip> : null}
          </div>
        </div>
        <IconButton size="sm" label="Đóng (Esc)" icon={<X className="size-4" />} onClick={onClose} />
      </header>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">{body}</div>
    </motion.aside>
  );
}
