// CITY-005 "Bảng vi phạm" (drawer of B03 and B07): every call the vault refused, newest first, with the reason in Vietnamese.
// Plain markup only (no sound/animation), so the list renders the same in tests. Technical names stay in the muted "Bên trong" line.
import { reasonTextVi, shortHash } from "../lib/ops";
import type { Violation, ViolationSource } from "../types";
import { useViolations } from "../hooks/useViolations";

export const SOURCE_VI: Record<ViolationSource, string> = { agent: "Agent", attacker: "Kẻ tấn công", fault: "Thử lỗi", copilot: "Trợ lý", other: "Khác" };
const ACTION_VI: Record<string, string> = { pay: "chuyển tiền", swap: "đổi token", raw: "gọi hợp đồng lạ", lock: "khoá khu" };
export const actionVi = (a: string): string => ACTION_VI[a] ?? "gửi lệnh";

export function ViolationRow({ v }: { v: Violation }) {
  return (
    <li data-violation={v.id} data-reason={v.reasonCode} className="rounded-[12px] px-2.5 py-1.5" style={{ background: "var(--red-soft)", border: "2px solid #f4c7bf" }}>
      <div className="flex items-start gap-2">
        <span className="font-toy text-[14.5px] font-bold leading-tight" style={{ color: "var(--red-ink)" }}>{reasonTextVi(v.reasonCode)}</span>
        <span className="ml-auto shrink-0 rounded-full px-2 py-px text-[11px] font-bold" style={{ background: "#fff", color: "var(--ink-2)" }}>{SOURCE_VI[v.source]}</span>
      </div>
      <div className="text-[12.5px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
        {v.keyLabel} {actionVi(v.action)}{v.district ? <> · khu {v.district}</> : null}
      </div>
      {v.txHash ? (
        <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px]" style={{ color: "var(--ink-2)" }} title={v.txHash}>
          {shortHash(v.txHash)}{v.simulated ? <span className="rounded-full px-2 py-px font-sans text-[11px] font-bold" style={{ background: "#e9defc", color: "var(--violet-d)" }}>giả lập</span> : null}
        </span>
      ) : <span className="text-[11.5px] font-semibold" style={{ color: "var(--ink-2)" }}>chặn trước khi gửi</span>}
    </li>
  );
}

export function ViolationsList({ items }: { items: Violation[] }) {
  if (items.length === 0) return <p className="toy-body m-0" style={{ fontSize: 13 }} data-empty>Chưa có lệnh nào bị chặn.</p>;
  return <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Các lệnh bị chặn">{items.map((v) => <ViolationRow key={v.id} v={v} />)}</ul>;
}

export function ViolationsPanel({ limit = 6 }: { limit?: number }) {
  const q = useViolations(limit);
  return (
    <section className="flex flex-col gap-1.5" data-violations-panel aria-label="Bảng vi phạm">
      <div className="flex items-baseline justify-between gap-2">
        <div className="toy-eyebrow" style={{ fontSize: 14 }}>Bảng vi phạm</div>
        {q.data?.length ? <span className="text-[12px] font-bold" style={{ color: "var(--red-ink)" }}>{q.data.length} lệnh bị chặn</span> : null}
      </div>
      {q.isError ? <p className="toy-body m-0" style={{ fontSize: 13 }} role="status">Chưa đọc được bảng này.</p> : <ViolationsList items={q.data ?? []} />}
      <p className="m-0 text-[11.5px] font-semibold" style={{ color: "var(--ink-2)" }} data-inside>Bên trong: mã lý do do chain trả về · đề 12</p>
    </section>
  );
}
