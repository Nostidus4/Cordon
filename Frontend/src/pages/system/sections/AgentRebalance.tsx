// Trợ lý Cân đối (spec §7.1): timeline of runs. The rule engine computes amountIn; the language model only writes the reason.
import { reasonTextVi } from "../../../lib/ops";
import { fmtPercent } from "../../../lib/format";
import { RobotIcon } from "../../../stage/ui";
import type { AgentRun } from "../../../types";
import { useState } from "react";
import { DRIFT_THRESHOLD, amountConsistent, computeAmountIn, driftOf, needsRebalance, sharesOf, verdictOf } from "../agent.logic";
import { hashState, reasonSourceVi, sortRunsNewest, stepRows, visibleCount } from "../agents.logic";
import { useHealth } from "../../../hooks/useHealth";
import { useAttempts } from "../../../hooks/useAttempts";
import { isoOfSec } from "../../../lib/dto";
import { useAgentRuns } from "../data";
import { AttemptDrawer } from "./Drawer";
import { ACCENT, Chip, Empty, Hash, Section, fmtClock } from "../ui";

const G = ACCENT.resp;
const INK2 = "var(--ink-2)";

/** Static diagram of the rule engine, one calm line. */
function RuleDiagram() {
  const steps: [string, string][] = [["Đầu vào", "số dư vault, hạn mức còn lại"], ["Lệch quá 5%?", "tTKB so với mục tiêu 20%"], ["Số tiền = mức nhỏ nhất", "thiếu · thẻ · khu · 5.000"], ["Chạy thử", "hỏi chain trước, chưa gửi"]];
  return (
    <div className="flex flex-wrap items-stretch gap-y-2" role="img" aria-label="Luật tính: đầu vào, kiểm tra lệch, tính số tiền, chạy thử, rồi đổi hoặc bị chặn">
      {steps.map(([t, s]) => (
        <div key={t} className="flex items-center">
          <div style={{ background: "#fff", borderRadius: 16, padding: "7px 14px", boxShadow: "0 2px 0 var(--line)" }}>
            <div className="font-toy" style={{ fontWeight: 800, fontSize: 14.5, lineHeight: 1.2 }}>{t}</div>
            <div style={{ fontSize: 11.5, color: INK2 }}>{s}</div>
          </div>
          <span aria-hidden style={{ width: 26, height: 3, background: "#d8c9a6", borderRadius: 2, margin: "0 2px" }} />
        </div>
      ))}
      <div className="flex flex-col justify-center gap-1">
        <span style={{ background: "var(--ok-soft)", color: "var(--ok-ink)", borderRadius: 999, padding: "2px 12px", fontWeight: 700, fontSize: 12.5 }}>✓ đã đổi, có giao dịch</span>
        <span style={{ background: "var(--red-soft)", color: "var(--red-ink)", borderRadius: 999, padding: "2px 12px", fontWeight: 700, fontSize: 12.5 }}>✕ bị chặn, có mã lỗi</span>
      </div>
    </div>
  );
}

function ShareBar({ share, target, threshold }: { share: number; target: number; threshold: number }) {
  const low = target - threshold;
  return (
    <div role="img" aria-label={`tTKB ${fmtPercent(share)}, mục tiêu ${target}%`} style={{ position: "relative", height: 12, borderRadius: 999, background: "#eadbbd", overflow: "hidden", minWidth: 120 }}>
      <div style={{ position: "absolute", left: `${low}%`, width: `${threshold}%`, top: 0, bottom: 0, background: "rgba(255,179,0,.35)" }} />
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(100, share)}%`, background: G, borderRadius: 999 }} />
      <div style={{ position: "absolute", left: `${target}%`, top: 0, bottom: 0, width: 3, background: "#2d2250" }} />
    </div>
  );
}

function RunRow({ r, first, simulated, onAttempt }: { r: AgentRun; first: boolean; simulated: boolean; onAttempt?: (id: number) => void }) {
  const d = r.decision, v = verdictOf(r), b = r.balances, sh = sharesOf(r);
  const calc = computeAmountIn(r);
  const consistent = amountConsistent(r);
  const color = v.kind === "swapped" ? "#22c55e" : v.kind === "blocked" ? "#ff2d3d" : "#5e8fa3";
  return (
    <article style={{ background: "#fff", borderRadius: 22, padding: "14px 18px 14px", boxShadow: first ? `0 10px 26px -18px ${color}, 0 2px 0 var(--line)` : "0 2px 0 var(--line)", display: "grid", gridTemplateColumns: "34px minmax(0,1fr)", gap: "0 14px" }}>
      <RobotIcon size={34} color={color} />
      <div style={{ minWidth: 0 }}>
        <div className="flex flex-wrap items-baseline gap-x-3">
          <b className="font-toy" style={{ fontSize: 18, color: v.kind === "swapped" ? "var(--ok-ink)" : v.kind === "blocked" ? "var(--red-ink)" : INK2 }}>
            {v.kind === "swapped" ? "Đã đổi" : v.kind === "blocked" ? "Bị chặn" : "Không làm gì"}
          </b>
          {d ? <span className="font-toy tnum" style={{ fontWeight: 800, fontSize: 26, lineHeight: 1 }}>{d.amountIn.display} <span style={{ fontSize: 13, color: INK2, fontWeight: 700 }}>{d.tokenIn} → {d.tokenOut}</span></span> : null}
          <span style={{ marginLeft: "auto", fontSize: 12, color: INK2 }}>{fmtClock(isoOfSec(r.ts))}</span>
        </div>

        {stepRows(r).length ? (
          <ol className="mt-2 flex flex-wrap items-center gap-1.5" style={{ margin: 0, padding: 0, listStyle: "none" }} aria-label="Các bước của lần chạy" data-run-steps>
            {stepRows(r).map((st, i) => (
              <li key={st.key} className="inline-flex items-center gap-1.5">
                {i ? <span aria-hidden style={{ width: 12, height: 3, background: "#d8c9a6", borderRadius: 2 }} /> : null}
                <Chip t={st.tone === "ok" ? "ok" : st.tone === "bad" ? "bad" : "grey"}>{st.tone === "ok" ? "✓" : st.tone === "bad" ? "✕" : "·"} {st.label}</Chip>
              </li>
            ))}
          </ol>
        ) : null}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5" style={{ fontSize: 12.5, color: INK2 }}>
          <span>vault <b className="tnum" style={{ color: "var(--ink)" }}>{b.vaultTusdc.display}</b> tUSDC · <b className="tnum" style={{ color: "var(--ink)" }}>{b.vaultTtkb.display}</b> tTKB</span>
          {sh ? <>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>tTKB <b className="tnum" style={{ color: "var(--ink)" }}>{fmtPercent(sh.share)}</b> / mục tiêu {sh.target}%<ShareBar share={sh.share} target={sh.target} threshold={DRIFT_THRESHOLD} /></span>
            <span>{needsRebalance(r, DRIFT_THRESHOLD) ? <>lệch <b className="tnum" style={{ color: "var(--ink)" }}>{fmtPercent(driftOf(r))}</b>, quá ngưỡng {DRIFT_THRESHOLD}%</> : <>lệch {fmtPercent(driftOf(r))}, trong ngưỡng</>}</span>
          </> : null}
        </div>

        {calc ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5" style={{ fontSize: 12.5, color: INK2 }}>
            <span style={{ fontWeight: 700 }} title="amountIn = min(…)">Số tiền đổi = nhỏ nhất của (</span>
            {calc.terms.map((t) => (
              <span key={t.id} className="tnum" style={{ background: calc.winner.id === t.id ? "var(--ok-soft)" : "#f6ecd9", color: calc.winner.id === t.id ? "var(--ok-ink)" : INK2, fontWeight: calc.winner.id === t.id ? 800 : 600, borderRadius: 999, padding: "1px 10px" }}>{t.label} {t.value.display}</span>
            ))}
            <span style={{ fontWeight: 700 }}>)</span>
            {consistent === false ? <Chip t="warn">gửi {d?.amountIn.display}, khác mức nhỏ nhất</Chip> : null}
          </div>
        ) : null}
        {r.reasonCode ? <div className="mt-2" style={{ color: "var(--red-ink)", fontWeight: 700, fontSize: 13 }}>{reasonTextVi(r.reasonCode)} <code className="mono" style={{ fontWeight: 600, marginLeft: 6 }}>{r.reasonCode}</code></div> : null}

        {r.reasonText ? <p style={{ margin: "10px 0 0", padding: "8px 14px", background: "#f3ecff", borderRadius: 14, fontWeight: 600, fontSize: 13.5 }}>
          “{r.reasonText}” <span style={{ fontSize: 11.5, color: INK2, fontWeight: 600, marginLeft: 6 }}>{reasonSourceVi(r.reasonSource)}</span>
          {hashState(r) !== "none" ? <span style={{ marginLeft: 8 }}><Chip t={hashState(r) === "match" ? "ok" : "bad"} title={r.reasonHashOnChain ?? undefined}>{hashState(r) === "match" ? "khớp với chain" : "không khớp chain"}</Chip></span> : null}
        </p> : null}
        {r.rejectedReasonText ? <p className="m-0 mt-1.5" style={{ fontSize: 12.5, color: INK2 }} data-rejected>AI định viết “{r.rejectedReasonText}” nhưng có số không khớp nên bị bỏ, dùng câu mẫu.</p> : null}
        {r.untrustedInput ? (
          <div className="mt-2" style={{ background: "#f6ecd9", border: "2px solid #ecdcbc", borderRadius: 12, padding: "6px 12px" }} data-injected>
            <div className="flex flex-wrap items-center gap-2"><b style={{ fontSize: 12, color: INK2 }}>Dữ liệu lạ nhét vào</b>{r.injectionIgnored ? <Chip t="teal">bỏ qua chỉ dẫn lạ trong dữ liệu</Chip> : <Chip t="warn">chưa rõ có bỏ qua không</Chip>}</div>
            <p className="m-0 mt-1" style={{ fontSize: 12.5, fontStyle: "italic" }}>“{r.untrustedInput}”</p>
          </div>
        ) : null}
        {r.attemptId != null && onAttempt ? <div className="mt-2"><button type="button" className="sx-tog" onClick={() => onAttempt(r.attemptId!)}>Xem lần thử #{r.attemptId} qua các cổng</button></div> : null}
        <details className="mt-1.5" style={{ fontSize: 12 }}>
          <summary style={{ cursor: "pointer", color: INK2, fontWeight: 600 }}>Chi tiết kỹ thuật</summary>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1" style={{ color: INK2 }}>
            <span>reasonHash {r.reasonHash ? <code className="mono" title={r.reasonHash}>{r.reasonHash.slice(0, 14)}…{r.reasonHash.slice(-6)}</code> : "không có (không gửi tx)"}</span>
            <span>tx {r.txHash ? <Hash value={r.txHash} simulated={simulated} /> : v.kind === "blocked" ? "chạy thử bị chain từ chối, không gửi" : "không có"}</span>
            <code className="mono">{r.id}</code>
          </div>
        </details>
      </div>
    </article>
  );
}

export function AgentRebalance() {
  const { data: runs, isError, isLoading } = useAgentRuns();
  const { data: health } = useHealth();
  const { data: attempts } = useAttempts();
  const [pages, setPages] = useState(1);
  const [selId, setSelId] = useState<number | null>(null);
  const list = sortRunsNewest(runs);
  const shown = list.slice(0, visibleCount(list.length, pages));
  const sel = selId != null ? (attempts ?? []).find((a) => a.id === selId) ?? null : null;
  return (
    <div data-tour="sys-agent-runs">
      <Section id="agent-chay" accent={G} title="Các lần chạy của Trợ lý Cân đối" sub="Giữ kho 80% tUSDC và 20% tTKB; luật tính số tiền, mô hình ngôn ngữ chỉ viết lý do.">
        <div className="mb-5"><RuleDiagram /></div>
        {isLoading ? <Empty>Đang tải…</Empty> : isError ? <Empty>Backend chưa mở danh sách lần chạy của Trợ lý.</Empty>
          : list.length === 0 ? <Empty>Trợ lý chưa chạy. Bấm “Trợ lý Cân đối” ở mục Tổng quan: lần đầu sẽ đổi đúng 5.000 tUSDC.</Empty> : (
            <div className="grid gap-3.5">
              {shown.map((r, i) => <RunRow key={r.id} r={r} first={i === 0} simulated={health?.simulated ?? true} onAttempt={setSelId} />)}
              {shown.length < list.length ? <div style={{ textAlign: "center" }}><button type="button" className="sx-tog" onClick={() => setPages((p) => p + 1)}>Xem thêm {list.length - shown.length} lần chạy cũ hơn</button></div> : null}
            </div>
          )}
        <AttemptDrawer attempt={sel} onClose={() => setSelId(null)} />
      </Section>
    </div>
  );
}
export default AgentRebalance;
