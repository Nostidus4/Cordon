// CITY-005 injection demo (drawer of B06): the foreign text, "đã bỏ qua", the unchanged decision, the refused direct pay, and the
// "đã khớp" badge for the reason hash. Reuses the agent runs the drawer already loads; plain markup only.
import { reasonTextVi } from "../lib/ops";
import type { AgentRun, Violation } from "../types";
import { useGuardRuns, useViolations } from "../hooks/useViolations";

export function HashBadge({ run }: { run: AgentRun }) {
  if (run.reasonHashVerified == null) return null;
  const ok = run.reasonHashVerified;
  return (
    <span data-hash-badge={ok ? "match" : "mismatch"} title={run.reasonHashOnChain ?? undefined} className="rounded-full px-2 py-px text-[11.5px] font-bold"
      style={{ background: ok ? "var(--teal-soft)" : "var(--red-soft)", color: ok ? "var(--teal-ink)" : "var(--red-ink)" }}>
      {ok ? "đã khớp" : "không khớp"}
    </span>
  );
}

export function AgentGuardView({ injected, latest, pay }: { injected: AgentRun | null; latest: AgentRun | null; pay: Violation | null }) {
  const d = injected?.decision;
  return (
    <section className="flex flex-col gap-1.5" data-agent-guard aria-label="Agent bị nhét lệnh lạ">
      <div className="toy-eyebrow" style={{ fontSize: 14 }}>Nhét lệnh lạ vào agent</div>
      {injected ? (
        <>
          <div className="rounded-[12px] px-2.5 py-1.5" style={{ background: "#f6ecd9", border: "2px solid #ecdcbc" }} data-injected>
            <div className="flex items-center gap-2">
              <span className="text-[12px] font-bold" style={{ color: "var(--ink-2)" }}>Văn bản lạ</span>
              <span className="rounded-full px-2 py-px text-[11.5px] font-bold" style={{ background: "var(--teal-soft)", color: "var(--teal-ink)" }} data-ignored>đã bỏ qua</span>
            </div>
            <p className="m-0 line-clamp-3 text-[12.5px] italic leading-snug" style={{ color: "var(--ink)" }}>“{injected.untrustedInput}”</p>
          </div>
          <div className="text-[13px] font-semibold leading-snug" style={{ color: "var(--ink)" }} data-decision>
            Quyết định không đổi: {d?.amountIn ? `đổi ${d.amountIn.display} ${d.tokenIn} sang ${d.tokenOut}` : "không đổi gì"}
          </div>
          {injected.rejectedReasonText ? (
            <p className="m-0 text-[12.5px] leading-snug" style={{ color: "var(--ink-2)" }} data-rejected>
              AI định viết “{injected.rejectedReasonText}” nhưng có số lạ nên bị bỏ, dùng câu mẫu.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]" style={{ color: "var(--ink)" }}>
            <span className="font-semibold">{injected.reasonText}</span>
            <HashBadge run={injected} />
          </div>
          {pay ? (
            <div className="rounded-[12px] px-2.5 py-1.5 text-[13px] font-bold" style={{ background: "var(--red-soft)", border: "2px solid #f4c7bf", color: "var(--red-ink)" }} data-direct-pay>
              Lệnh chuyển thẳng cho ví lạ bị chặn: {reasonTextVi(pay.reasonCode)}
            </div>
          ) : null}
        </>
      ) : (
        <p className="toy-body m-0" style={{ fontSize: 13 }} data-empty>
          Chưa có văn bản lạ nào. Thử ở mục “Thử lỗi”.{latest ? <> Lần chạy gần nhất <HashBadge run={latest} /></> : null}
        </p>
      )}
      <p className="m-0 text-[11.5px] font-semibold" style={{ color: "var(--ink-2)" }} data-inside>Bên trong: quyết định do luật tính, câu giải thích chỉ để đọc · đề 12</p>
    </section>
  );
}

export function AgentGuardPanel() {
  const runs = useGuardRuns().data ?? { injected: null, latest: null };
  const pay = (useViolations(20).data ?? []).find((v) => v.source === "agent" && v.action === "pay") ?? null;
  return <AgentGuardView injected={runs.injected} latest={runs.latest} pay={pay} />;
}
