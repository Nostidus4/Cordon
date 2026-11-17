// Tab "Agent AI": which agents exist, which key/district binds each, what they did, and what the chain answered.
// The rule engine decides money; the language model only words a reason, or drafts something a person confirms.
import { useState, type ReactNode } from "react";
import { useGraph } from "../../../hooks/useGraph";
import { useIncidents } from "../../../hooks/useBuildings";
import { useViolations } from "../../../hooks/useViolations";
import { useCopilot } from "../../../hooks/useCopilot";
import { useTxChecks } from "../../../hooks/useTxGuard";
import { usePayrollRuns } from "../../../hooks/usePayroll";
import { useHealth } from "../../../hooks/useHealth";
import { isoOfSec } from "../../../lib/dto";
import { reasonTextVi } from "../../../lib/ops";
import { LEVEL_VI } from "../../../stage/txGuardLogic";
import type { CopilotDraft, Incident, TxCheck } from "../../../types";
import { SOURCE_VI, buildRoster, countBySource, filterViolations, incidentRows, isOpenIncident, statusLabel, type RosterCard, type SourceFilter, type Tone } from "../agents.logic";
import { useAgentRuns, useNow } from "../data";
import { ACCENT, Chip, Empty, Hash, Section, fmtClock } from "../ui";
import { AgentRebalance } from "./AgentRebalance";
import { Assistant } from "./Assistant";

const INK2 = "var(--ink-2)";
const clock = (ts: number | null) => (ts == null ? "" : fmtClock(isoOfSec(ts)));
const toneOf = (t: Tone) => (t === "grey" ? "grey" : t);

function Card({ c }: { c: RosterCard }) {
  const live = c.status.kind === "busy" || c.status.kind === "recent";
  return (
    <article data-agent={c.id} style={{ background: "#fff", borderRadius: 22, padding: "14px 16px", boxShadow: "0 2px 0 var(--line)", display: "grid", gap: 8, alignContent: "start", border: c.scripted ? "2px dashed #e2a59a" : undefined }}>
      <div className="flex flex-wrap items-center gap-2">
        <b className="font-toy" style={{ fontSize: 18, flex: "1 1 120px" }}>{c.name}</b>
        {c.scripted ? <Chip t="bad">giả lập</Chip> : null}
        <Chip t={live ? "ok" : c.status.kind === "unavailable" ? "warn" : "grey"} title={c.status.ts ? clock(c.status.ts) : undefined}>
          <span className="sx-dot" data-live={live ? "true" : undefined} />{c.status.kind === "recent" && c.status.ts ? `${statusLabel(c.status)} ${clock(c.status.ts)}` : c.status.label}
        </Chip>
      </div>
      <div style={{ fontSize: 12.5, color: INK2, marginTop: -4 }}>{c.role}</div>
      <div style={{ fontSize: 13 }}><b style={{ color: "var(--ok-ink)" }}>Được làm</b> {c.mayDo}</div>
      <div style={{ fontSize: 13 }}><b style={{ color: "var(--red-ink)" }}>Không bao giờ</b> {c.never}</div>
      <div style={{ background: "#f6ecd9", borderRadius: 12, padding: "6px 10px", fontSize: 12.5 }} data-binding>
        {c.bindings.length ? c.bindings.map((b) => (
          <div key={b.keyId}><b>{b.keyLabel}</b> <code className="mono" style={{ color: INK2 }}>{b.keyId}</code> · khu <b>{b.district ?? "chưa rõ"}</b></div>
        )) : <b>Không có khoá ký</b>}
        <div style={{ color: INK2 }}>{c.bindingNote}</div>
      </div>
      {c.outcome ? <div><span style={{ fontSize: 12, color: INK2 }}>Lần gần nhất </span><Chip t={toneOf(c.outcome.tone)}>{c.outcome.label}</Chip></div> : null}
    </article>
  );
}

function Roster() {
  const now = useNow(5000);
  const graph = useGraph().data;
  const runs = useAgentRuns().data;
  const payrollRuns = usePayrollRuns().data;
  const incidents = useIncidents("all").data;
  const violations = useViolations(50).data;
  const drafts = useCopilot().drafts;
  const checks = useTxChecks(10).data;
  const cards = buildRoster({ graph, runs, payrollRuns, incidents, violations, drafts, checks, now: Math.floor(now / 1000) });
  return (
    <div data-tour="sys-agent-roster">
      <Section id="agent-danh-sach" accent={ACCENT.resp} title="Ai đang làm việc trong hệ thống" sub="Mỗi agent ký bằng một thẻ gắn với một khu, nên cùng luật chain chặn nó. AI không bao giờ tự quyết tiền: luật quyết, AI chỉ viết lý do hoặc soạn nháp cho người xác nhận.">
        <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 300px), 1fr))" }}>
          {cards.map((c) => <Card key={c.id} c={c} />)}
        </div>
      </Section>
    </div>
  );
}

function IncidentCard({ i }: { i: Incident }) {
  const rows = incidentRows(i);
  const open = isOpenIncident(i);
  return (
    <article style={{ background: "#fff", borderRadius: 18, padding: "10px 14px", boxShadow: "0 2px 0 var(--line)" }} data-incident={i.id}>
      <div className="flex flex-wrap items-center gap-2">
        <b>{i.titleVi}</b>
        <Chip t={open ? "warn" : "ok"}>{open ? "đang mở" : "đã xong"}</Chip>
        <span style={{ marginLeft: "auto", fontSize: 12, color: INK2 }}>{clock(i.openedAt)}</span>
      </div>
      <ol className="m-0 mt-2 grid gap-1" style={{ padding: 0, listStyle: "none" }}>
        {rows.map((s) => (
          <li key={s.key} className="flex flex-wrap items-baseline gap-x-2" style={{ fontSize: 12.5, opacity: s.tone === "pending" || s.tone === "skipped" ? 0.55 : 1 }}>
            <Chip t={s.tone === "done" ? "ok" : s.tone === "active" ? "warn" : "grey"}>{s.tone === "done" ? "✓" : s.tone === "active" ? "…" : "·"} {s.label}</Chip>
            <span style={{ color: INK2, flex: "1 1 160px" }}>{s.detail}</span>
            {s.ts ? <span className="tnum" style={{ color: INK2 }}>{clock(s.ts)}</span> : null}
            {s.txHash ? <Hash value={s.txHash} /> : null}
          </li>
        ))}
      </ol>
    </article>
  );
}

function Incidents() {
  const { data, isError, isLoading } = useIncidents("all");
  const list = [...(data ?? [])].sort((a, b) => b.openedAt - a.openedAt).slice(0, 4);
  return (
    <Section id="agent-su-co" accent={ACCENT.safety} title="Ứng cứu sự cố" sub="Phát hiện, siết ngay, đề xuất khôi phục, Hội đồng duyệt. Siết thì làm ngay; nới luôn cần Hội đồng 2/3.">
      {isLoading ? <Empty>Đang tải…</Empty> : isError ? <Empty>Chưa đọc được danh sách sự cố.</Empty>
        : list.length === 0 ? <Empty>Chưa có sự cố nào. Gây một lỗi ở cảnh “Sự cố” để xem agent ứng cứu làm việc.</Empty>
        : <div className="grid gap-3">{list.map((i) => <IncidentCard key={i.id} i={i} />)}</div>}
    </Section>
  );
}

const FILTERS: SourceFilter[] = ["all", "agent", "attacker", "copilot", "fault"];
function Violations() {
  const { data, isError, isLoading } = useViolations(50);
  const [f, setF] = useState<SourceFilter>("all");
  const counts = countBySource(data);
  const shown = filterViolations(data, f).slice(0, 12);
  const { data: health } = useHealth();
  return (
    <Section id="agent-bi-chan" accent={ACCENT.growth} title="Lần bị chặn, theo nguồn" sub="Ai đã thử, bằng thẻ nào, trong khu nào, và chain trả lời gì."
      right={<div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc theo nguồn">
        {FILTERS.map((k) => <button key={k} type="button" className="sx-tog" style={{ ["--ac" as string]: ACCENT.growth }} aria-pressed={f === k} onClick={() => setF(k)}>{k === "all" ? "Tất cả" : SOURCE_VI[k]} <span className="c">{counts[k]}</span></button>)}
      </div>}>
      {isLoading ? <Empty>Đang tải…</Empty> : isError ? <Empty>Chưa đọc được danh sách lần bị chặn.</Empty>
        : shown.length === 0 ? <Empty>Chưa có lần nào bị chặn{f !== "all" ? " từ nguồn này" : ""}.</Empty> : (
          <div className="sx-scroll" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr style={{ textAlign: "left", color: INK2, fontSize: 12 }}>{["Giờ", "Nguồn", "Thẻ", "Khu", "Lý do", "Giao dịch"].map((h) => <th key={h} style={{ padding: "4px 8px" }}>{h}</th>)}</tr></thead>
              <tbody>
                {shown.map((v) => (
                  <tr key={v.id} style={{ borderTop: "2px solid var(--line)" }}>
                    <td className="tnum" style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>{clock(v.ts)}</td>
                    <td style={{ padding: "6px 8px" }}><Chip t={v.source === "attacker" ? "bad" : v.source === "copilot" ? "violet" : v.source === "agent" ? "info" : "grey"}>{SOURCE_VI[v.source]}</Chip></td>
                    <td style={{ padding: "6px 8px" }}>{v.keyLabel}</td>
                    <td style={{ padding: "6px 8px" }}>{v.district ?? "—"}</td>
                    <td style={{ padding: "6px 8px", color: "var(--red-ink)", fontWeight: 700 }}>{reasonTextVi(v.reasonCode)}</td>
                    <td style={{ padding: "6px 8px" }}>{v.txHash ? <Hash value={v.txHash} simulated={v.simulated || (health?.simulated ?? false)} /> : <span style={{ color: INK2 }}>chặn trước khi gửi</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Section>
  );
}

function DraftRow({ d }: { d: CopilotDraft }) {
  const pending = d.status === "pending";
  const st: Record<CopilotDraft["status"], string> = { pending: "chờ người xác nhận", confirmed: "đang gửi", rejected: "đã huỷ", sent: "đã gửi", blocked: "bị chặn" };
  return (
    <li className="flex flex-wrap items-center gap-2" style={{ background: pending ? "var(--amber-soft, #fff3d6)" : "#fbf2de", borderRadius: 12, padding: "6px 10px", fontSize: 13 }}>
      <Chip t={pending ? "warn" : d.status === "blocked" ? "bad" : "grey"}>{st[d.status]}</Chip>
      <span style={{ flex: "1 1 180px" }}>{d.summaryVi}</span>
      <span style={{ fontSize: 12, color: INK2 }}>thẻ {d.details.signerLabel} · {clock(d.createdAt)}</span>
    </li>
  );
}
function CheckRow({ c }: { c: TxCheck }) {
  return (
    <li className="flex flex-wrap items-center gap-2" style={{ background: "#fbf2de", borderRadius: 12, padding: "6px 10px", fontSize: 13 }}>
      <Chip t={c.level === "safe" ? "ok" : c.level === "caution" ? "warn" : "bad"}>{LEVEL_VI[c.level]}</Chip>
      <span style={{ flex: "1 1 180px" }}>{c.explanationVi}</span>
      <span style={{ fontSize: 12, color: INK2 }}>{clock(c.createdAt)}</span>
    </li>
  );
}

function DraftsAndChecks() {
  const drafts = useCopilot().drafts;
  const checks = useTxChecks(8);
  const shownDrafts = [...drafts.filter((d) => d.status === "pending"), ...drafts.filter((d) => d.status !== "pending")].slice(0, 6);
  const col = (title: string, sub: string, body: ReactNode) => (
    <div style={{ minWidth: 0 }}><b className="font-toy" style={{ fontSize: 16 }}>{title}</b><div style={{ fontSize: 12.5, color: INK2, marginBottom: 8 }}>{sub}</div>{body}</div>
  );
  return (
    <Section id="agent-nhap" accent={ACCENT.spend} title="Nháp của Copilot và lần kiểm tra giao dịch" sub="Cả hai chỉ chuẩn bị và cảnh báo. Gửi hay bỏ là việc của người.">
      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))" }}>
        {col("Nháp của Copilot", "Nháp nào cũng chờ người xác nhận mới được gửi.",
          shownDrafts.length ? <ul className="m-0 grid gap-1.5" style={{ padding: 0, listStyle: "none" }}>{shownDrafts.map((d) => <DraftRow key={d.id} d={d} />)}</ul> : <Empty>Chưa có nháp nào (ở bản demo trình duyệt, Copilot không lưu nháp).</Empty>)}
        {col("Kiểm tra giao dịch", "Chỉ đọc: chạy thử rồi báo mức nguy hiểm.",
          checks.isError ? <Empty>Chưa đọc được các lần kiểm tra.</Empty>
            : (checks.data ?? []).length ? <ul className="m-0 grid gap-1.5" style={{ padding: 0, listStyle: "none" }}>{(checks.data ?? []).slice(0, 6).map((c) => <CheckRow key={c.id} c={c} />)}</ul> : <Empty>Chưa có lần kiểm tra nào.</Empty>)}
      </div>
    </Section>
  );
}

export function Agents() {
  const [pane, setPane] = useState<"work" | "ask">("work");
  return (
    <div className="grid gap-4">
      <div className="sx-seg" role="group" aria-label="Chọn mục" style={{ justifySelf: "start" }}>
        <button type="button" aria-pressed={pane === "work"} onClick={() => setPane("work")}>Đang làm gì</button>
        <button type="button" aria-pressed={pane === "ask"} onClick={() => setPane("ask")}>Trợ lý hỏi đáp</button>
      </div>
      {pane === "work" ? (
        <>
          <Roster />
          <AgentRebalance />
          <Incidents />
          <Violations />
          <DraftsAndChecks />
        </>
      ) : <Assistant />}
    </div>
  );
}
export default Agents;

