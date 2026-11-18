// Tab "Tổng quan": the numbers that matter right now + the scenario control row.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Play, RotateCcw } from "lucide-react";
import { env } from "../../../lib/api";
import { useAttempts } from "../../../hooks/useAttempts";
import { useActions } from "../../../hooks/useActions";
import { useEvents } from "../../../hooks/useEvents";
import { useGraph } from "../../../hooks/useGraph";
import { useHealth } from "../../../hooks/useHealth";
import { Counter, ToyButton } from "../../../stage/ui";
import { useIncidents } from "../../../hooks/useBuildings";
import { useViolations } from "../../../hooks/useViolations";
import { isoOfSec } from "../../../lib/dto";
import { reasonTextVi } from "../../../lib/ops";
import { holdState, incidentCellText, nowStrip } from "../agents.logic";
import { useAgentRuns, useNow } from "../data";
import { useFeed } from "../feed";
import { playFullScenario, STEP_LABEL, type ScenarioStep } from "../scenario";
import { Chip, Stat, fmtClock } from "../ui";
import { policyLabel } from "../../../lib/policy";

const fmtUptime = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}g ${String(m).padStart(2, "0")}p` : m ? `${m}p ${String(x).padStart(2, "0")}s` : `${x}s`;
};

export function Overview() {
  const { data: health } = useHealth();
  const { data: events } = useEvents();
  const { data: attempts } = useAttempts();
  const now = useNow(1000);
  const [mountedAt] = useState(() => Date.now());
  const ok = attempts?.filter((a) => a.outcome === "ok").length ?? 0;
  const blocked = (attempts?.length ?? 0) - ok;
  const uptime = Math.floor((now - mountedAt) / 1000);
  const sim = health?.chainMode !== "l1";
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
      <Stat k="Chain" v={sim ? "sim" : "Guardian L1"} tone={sim ? "warn" : "ok"} />
      <Stat k="API" v={env.apiMode} />
      <Stat k="Block mới nhất" v={health ? <Counter value={health.l1Block} className="tnum" /> : "…"} />
      <Stat k="Policy" v={health ? `v${policyLabel(health)}` : "…"} tone={health && (policyLabel(health) ?? 1) > 1 ? "violet" : undefined} />
      <Stat k="Sự kiện" v={<Counter value={events?.length ?? 0} className="tnum" />} />
      <Stat k="Lần thử OK / chặn" v={<><span style={{ color: "var(--ok-ink)" }}>{ok}</span><span style={{ color: "var(--ink-2)", fontWeight: 600 }}> / </span><span style={{ color: blocked ? "var(--red-ink)" : "var(--ink-2)" }}>{blocked}</span></>} />
      <Stat k="Uptime" v={fmtUptime(uptime)} />
    </div>
  );
}

/** "Đang chạy gì": the last agent run, an open incident and the last attacker attempt; links to the Agent AI tab. */
export function NowStrip() {
  const { data: runs } = useAgentRuns();
  const { data: incidents } = useIncidents("all");
  const { data: violations } = useViolations(50);
  const { data: graph } = useGraph();
  const n = nowStrip({ runs, incidents, violations });
  const inc = incidentCellText(n, holdState(graph));
  const clk = (ts: number) => fmtClock(isoOfSec(ts));
  const run = n.lastRun;
  return (
    <Link to="/he-thong/agent" data-tour="sys-now" aria-label="Đang chạy gì: mở mục Agent AI" className="flex flex-wrap items-center gap-x-5 gap-y-2" style={{ background: "#fff", borderRadius: 20, padding: "10px 16px", boxShadow: "0 2px 0 var(--line)", color: "inherit", textDecoration: "none" }}>
      <span className="font-toy" style={{ fontWeight: 800, fontSize: 17 }}>Đang chạy gì</span>
      <span style={{ fontSize: 13 }}>Agent Cân đối: {run ? <b>{run.outcome === "swapped" ? "đã đổi" : run.outcome === "no_action" ? "không cần làm gì" : "bị chặn"} lúc {clk(run.ts)}</b> : <span style={{ color: "var(--ink-2)" }}>chưa chạy</span>}</span>
      <span style={{ fontSize: 13 }}>Sự cố: {inc.tone === "bad" ? <b style={{ color: "var(--red-ink)" }}>{inc.text}</b> : <span style={{ color: "var(--ink-2)" }}>{inc.text}</span>}</span>
      <span style={{ fontSize: 13 }}>Kẻ tấn công: {n.lastAttacker ? <b>bị chặn lúc {clk(n.lastAttacker.ts)}, {reasonTextVi(n.lastAttacker.reasonCode)}</b> : <span style={{ color: "var(--ink-2)" }}>chưa thử</span>}</span>
      <span style={{ marginLeft: "auto", fontWeight: 700, fontSize: 13 }}>Xem Agent AI →</span>
    </Link>
  );
}

export function Controls() {
  const a = useActions();
  const qc = useQueryClient();
  const { data: health } = useHealth();
  const { data: graph } = useGraph();
  const [busy, setBusy] = useState<ScenarioStep | null>(null);
  const minhLocked = graph?.districts.find((d) => d.principalId === "minh")?.locked ?? false;
  const paused = graph?.nodes.find((n) => n.id === "vault")?.data.paused === true;
  const v2 = (policyLabel(health) ?? 1) >= 2;
  const rest = () => useFeed.getState().rest1(true);
  const act = <T,>(m: { mutate: (v: T) => void }, v: T) => { rest(); m.mutate(v); };
  const full = async () => {
    setBusy("reset");
    try { rest(); await playFullScenario({ onStep: (s) => { setBusy(s); rest(); } }); } finally { setBusy(null); void qc.invalidateQueries(); }
  };
  const off = busy !== null;
  return (
    <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Kịch bản" data-tour="sys-controls">
      <span className="font-toy" style={{ fontWeight: 800, fontSize: 17, marginRight: 4 }}>Kịch bản</span>
      <ToyButton size="xs" color="cream" disabled={off} icon={<RotateCcw size={13} aria-hidden />} onClick={() => act(a.reset, undefined)}>Đặt lại</ToyButton>
      <ToyButton size="xs" color="violet" disabled={off || v2} done={v2} onClick={() => act(a.policyV2, undefined)}>① Chính sách v2</ToyButton>
      <ToyButton size="xs" color="orange" disabled={off} onClick={() => act(a.runAgent, undefined)}>② Trợ lý Cân đối</ToyButton>
      <ToyButton size="xs" color="red" disabled={off} onClick={() => act(a.runScene4, undefined)}>③ Kẻ gian 1–5</ToyButton>
      <ToyButton size="xs" color="teal" disabled={off || minhLocked} done={minhLocked} onClick={() => act(a.lock, { principalId: "minh", member: "lan" })}>④ Khoá khu Minh</ToyButton>
      <ToyButton size="xs" color="blue" disabled={off || !minhLocked} onClick={() => act(a.step7, undefined)}>⑤ Bước 7</ToyButton>
      <ToyButton size="xs" color="cream" disabled={off || paused} done={paused} onClick={() => act(a.pause, { member: "lan" })}>Dừng cả kho</ToyButton>
      <ToyButton size="xs" color="green" disabled={off} icon={<Play size={13} aria-hidden />} onClick={() => void full()}>Chạy cả kịch bản</ToyButton>
      {busy ? <Chip t="info">{STEP_LABEL[busy]}…</Chip> : null}
    </div>
  );
}
