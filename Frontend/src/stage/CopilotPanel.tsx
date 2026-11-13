// B02 Trợ lý AI, Copilot part (CITY-004): chat box, draft card ("Xác nhận gửi" / "Huỷ"), result line, eval summary.
// The assistant only PREPARES; nothing is sent until the person presses "Xác nhận gửi", and the vault on chain decides.
import { useState } from "react";
import { useCopilot, useCopilotDraftActions } from "../hooks/useCopilot";
import { useHealth } from "../hooks/useHealth";
import { ApiError } from "../lib/api";
import { reasonTextVi, shortHash } from "../lib/ops";
import type { CopilotDraft, CopilotEval } from "../types";
import { CheckIcon, CrossIcon, ToyButton, WarnIcon } from "./ui";

const EXAMPLES = ["Chuyển 5.000 USDC cho nhà cung cấp cloud", "Đổi 1.000 USDC sang TKB"];
const STATUS_VI: Record<CopilotDraft["status"], string> = { pending: "Chưa gửi", confirmed: "Đang gửi", rejected: "Đã huỷ", sent: "Đã gửi", blocked: "Bị chặn" };

function DraftCard({ d, demo }: { d: CopilotDraft; demo: boolean }) {
  const { confirm, reject } = useCopilotDraftActions();
  const [ack, setAck] = useState(false);
  const danger = d.txCheckLevel === "danger";
  const pending = d.status === "pending";
  const err = confirm.error instanceof ApiError ? confirm.error.message : null;
  return (
    <div className="rounded-[14px] p-2.5" style={{ background: "#f6ecd9", border: `2px solid ${danger && pending ? "var(--red)" : "#ecdcbc"}` }} data-copilot-draft={d.id} data-status={d.status}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 text-[14px] font-bold leading-snug" style={{ color: "var(--ink)" }}>{d.summaryVi}</div>
        <span className="shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold" style={{ background: d.status === "blocked" ? "var(--red-soft)" : d.status === "sent" ? "var(--teal-soft)" : "#f1e4cc", color: d.status === "blocked" ? "var(--red-ink)" : d.status === "sent" ? "var(--teal-ink)" : "var(--ink-2)" }}>{STATUS_VI[d.status]}</span>
      </div>
      {danger && pending ? (
        <label className="mt-1.5 flex items-center gap-2 text-[12.5px] font-bold" style={{ color: "var(--red-ink)" }}>
          <WarnIcon size={15} /> Trạm soi báo nguy hiểm.
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} aria-label="Tôi hiểu rủi ro" /> Tôi hiểu rủi ro
        </label>
      ) : d.txCheckLevel === "caution" && pending ? <p className="m-0 mt-1 text-[12.5px] font-bold" style={{ color: "var(--amber-ink)" }}>Trạm soi báo cần chú ý.</p> : null}
      {pending ? (
        <div className="mt-2 flex gap-1.5">
          <ToyButton size="xs" color="green" disabled={!demo || confirm.isPending || (danger && !ack)} title={demo ? undefined : "Cần chế độ demo để gửi"} onClick={() => confirm.mutate({ id: d.id, acknowledgeRisk: ack })}>Xác nhận gửi</ToyButton>
          <ToyButton size="xs" color="cream" disabled={reject.isPending} onClick={() => reject.mutate(d.id)}>Huỷ</ToyButton>
        </div>
      ) : null}
      {err ? <p role="alert" className="m-0 mt-1.5 text-[12.5px] font-bold" style={{ color: "var(--red-ink)" }}>{err}</p> : null}
      {d.result ? (
        <p className="m-0 mt-1.5 flex items-start gap-1.5 text-[12.5px] font-bold" style={{ color: d.result.ok ? "var(--teal-ink)" : "var(--red-ink)" }} data-copilot-result>
          <span className="mt-[2px] shrink-0">{d.result.ok ? <CheckIcon size={13} /> : <CrossIcon size={13} />}</span>
          <span>{d.result.ok ? "Đã gửi xong" : `Bị chặn: ${reasonTextVi(d.result.reasonCode) || "chain từ chối"}`}
            {d.result.txHash ? <span className="ml-1.5 font-mono text-[11.5px] font-medium" style={{ color: "var(--ink-2)" }}>{shortHash(d.result.txHash)}{d.result.simulated ? " · giả lập" : ""}</span> : null}</span>
        </p>
      ) : null}
      <p className="m-0 mt-1.5 text-[11.5px] font-semibold" style={{ color: "var(--ink-2)" }} data-inside>Bên trong: PolicyVault · {d.intent === "pay" ? "pay" : "swap"} · thẻ {shortHash(d.prepared.signer)}</p>
    </div>
  );
}

function EvalLine({ r }: { r: CopilotEval | null }) {
  if (!r) return <p className="toy-body m-0" style={{ fontSize: 12.5 }}>Chưa có báo cáo đánh giá.</p>;
  return (
    <div data-copilot-eval>
      <div className="text-[13px] font-bold" style={{ color: "var(--ink)" }}>
        Đánh giá {r.total} câu: hiểu đúng {r.intentAccuracy.correct}/{r.intentAccuracy.total} · chặn đúng {r.wrongTxBlocked.blocked}/{r.wrongTxBlocked.total}
      </div>
      <p className="m-0 text-[11.5px] font-semibold" style={{ color: "var(--ink-2)" }}>Bên trong: copilot_eval · chặn bởi từ chối {r.wrongTxBlocked.byRefusal}, luật chain {r.wrongTxBlocked.byChain}, trạm soi {r.wrongTxBlocked.byCheckpoint}</p>
    </div>
  );
}

export function CopilotPanel() {
  const { lines, ask, drafts, evalReport } = useCopilot();
  const demo = !!useHealth().data?.demoMode;
  const [text, setText] = useState("");
  const send = (m: string) => { const v = m.trim(); if (v && !ask.isPending) { ask.mutate(v); setText(""); } };
  const shown = [...drafts.filter((d) => d.status === "pending"), ...drafts.filter((d) => d.status !== "pending").slice(0, 2)];
  return (
    <div className="mt-3 flex flex-col gap-2.5 border-t-2 border-dashed pt-3" style={{ borderColor: "#ecdcbc" }} data-copilot-panel>
      <div className="toy-eyebrow" style={{ fontSize: 14 }}>Nhờ trợ lý</div>
      {lines.length ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-live="polite">
          {lines.map((l, i) => (
            <li key={i} className="rounded-[12px] px-2.5 py-1.5 text-[13px] leading-snug" data-line={l.role}
              style={{ alignSelf: l.role === "you" ? "flex-end" : "flex-start", background: l.role === "you" ? "var(--violet-soft, #e9defc)" : "#fff", border: "2px solid #f1e4cc", color: "var(--ink)", maxWidth: "92%" }}>
              {l.text}{l.unverified ? <span className="ml-1 font-bold" style={{ color: "var(--amber-ink)" }}>(chưa kiểm chứng)</span> : null}
            </li>
          ))}
        </ul>
      ) : <p className="toy-body m-0" style={{ fontSize: 12.5 }}>Hỏi số liệu hoặc nhờ soạn lệnh chi. Mình chỉ soạn, bạn xác nhận mới gửi.</p>}
      <form className="flex gap-1.5" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={600} aria-label="Nhắn cho trợ lý" placeholder="Ví dụ: Chuyển 5.000 USDC cho nhà cung cấp cloud"
          className="min-w-0 flex-1 rounded-full border-2 px-3 py-1.5 text-[13px]" style={{ borderColor: "#ecdcbc", background: "#fffdf8", color: "var(--ink)" }} />
        <ToyButton size="xs" color="violet" type="submit" disabled={ask.isPending || !text.trim()}>{ask.isPending ? "…" : "Gửi"}</ToyButton>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {EXAMPLES.map((e) => <button key={e} type="button" onClick={() => send(e)} disabled={ask.isPending} className="rounded-full border-0 px-2.5 py-1 text-[12px] font-bold" style={{ background: "#f1e4cc", color: "var(--ink)", cursor: "pointer" }}>{e}</button>)}
      </div>
      {shown.map((d) => <DraftCard key={d.id} d={d} demo={demo} />)}
      <EvalLine r={evalReport} />
    </div>
  );
}
