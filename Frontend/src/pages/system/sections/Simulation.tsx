// Rủi ro: simulateCompromise runner (youThink / enforced / estimated), findings R1-R4 and the §8.4 reference table.
import { createContext, useContext, useMemo, useState } from "react";
import { Play } from "lucide-react";
import { useFindings } from "../../../hooks/useFindings";
import { useGraph } from "../../../hooks/useGraph";
import { useProposals } from "../../../hooks/useProposals";
import { useSimulate } from "../../../hooks/useSimulate";
import { fmtPercent } from "../../../lib/format";
import { ToyButton } from "../../../stage/ui";
import type { ProposedChange, RuleId, SimResult } from "../../../types";
import { REFERENCE, matchReference, presetsFrom } from "../sim.logic";
import { ACCENT, Empty, JsonView, Section, Stat } from "../ui";
import { policyLabel } from "../../../lib/policy";
import { findingDetail } from "../../../lib/findingText";

const RULES: { id: RuleId; short: string; name: string; cond: string; sev: "HIGH" | "MEDIUM"; fix: string }[] = [
  { id: "R1_MULTI_KEY_NO_SHARED_CAP", short: "R1", name: "Nhiều thẻ, không có trần chung", cond: "Một người điều khiển từ 2 thẻ ở các khu khác nhau, hoặc khu có từ 2 thẻ mà chưa có trần chung.", sev: "HIGH", fix: "Gom về một khu, trần chung = trần thẻ lớn nhất × 1,5." },
  { id: "R2_AGENT_NO_ALLOWLIST", short: "R2", name: "Thẻ AI chưa có danh sách người nhận", cond: "Thẻ AGENT hoặc SERVICE mà kho chưa bật whitelist người nhận.", sev: "MEDIUM", fix: "Bật whitelist." },
  { id: "R3_ADMIN_IS_OPERATOR", short: "R3", name: "Người quản trị cũng là người vận hành", cond: "Quan hệ tự khai ADMINS đến từ chính khu đang vận hành thẻ đó.", sev: "MEDIUM", fix: "Gom thẻ service về khu của người quản trị." },
  { id: "R4_COUNCIL_CONCENTRATION", short: "R4", name: "Quyền lực dồn vào một thành viên Hội đồng", cond: "Đề xuất khiến một thành viên vừa có khu rủi ro lớn vừa giữ phiếu duyệt.", sev: "HIGH", fix: "Cảnh báo và gợi ý khu do Hội đồng sở hữu." },
];

const NO_CHANGE = "none";
interface RunState { ids: string[]; changeId: string }

function useRunner() {
  const { data: graph } = useGraph();
  const { data: proposals } = useProposals();
  const presets = useMemo(() => presetsFrom(proposals), [proposals]);
  const [pick, setPick] = useState<string[]>(["minh"]);
  const [preset, setPreset] = useState<string>(NO_CHANGE);
  const [run, setRun] = useState<RunState>({ ids: ["minh"], changeId: NO_CHANGE });
  const change: ProposedChange | undefined = presets.find((p) => p.id === run.changeId)?.change;
  const q = useSimulate(run.ids, change);
  return { graph, presets, pick, setPick, preset, setPreset, run, setRun, change, ...q };
}
const RunnerCtx = createContext<ReturnType<typeof useRunner> | null>(null);
const useRunnerCtx = () => { const c = useContext(RunnerCtx); if (!c) throw new Error("RunnerCtx"); return c; };

export function Simulation() {
  const runner = useRunner();
  return (
    <RunnerCtx.Provider value={runner}>
      <Section id="mo-phong" accent={ACCENT.growth} title="Nếu thẻ bị chiếm thì mất bao nhiêu?" sub="Ba con số: bạn nghĩ, chain thật sự chặn, và ước tính gồm cả quan hệ tự khai.">
        <div className="grid gap-x-8 gap-y-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 500px), 1fr))" }}>
          <Runner />
          <Rules />
        </div>
        <Reference />
      </Section>
    </RunnerCtx.Provider>
  );
}

const h = { fontFamily: "var(--font-toy)", fontWeight: 800, fontSize: 17, margin: "0 0 8px" } as const;

function Totals({ r, dim }: { r: SimResult; dim?: boolean }) {
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", opacity: dim ? 0.62 : 1 }}>
      <Stat k="Bạn nghĩ" v={r.totals.youThink.display} />
      <Stat k="Chain chặn" v={r.totals.enforced.display} tone="ok" />
      <Stat k="Ước tính" v={r.totals.estimated.display} tone={r.totals.estimated.raw !== r.totals.enforced.raw ? "warn" : undefined} />
      <Stat k="% quỹ chính" v={fmtPercent(r.totals.percentOfMainTreasury)} tone="violet" />
    </div>
  );
}

function Runner() {
  const rn = useRunnerCtx();
  const { graph, presets, pick, setPick, preset, setPreset, run, setRun, data, isFetching, error } = rn;
  const ids = (graph?.districts ?? []).map((d) => ({ id: d.principalId, label: d.label }));
  const [json, setJson] = useState(false);
  const dirty = [...pick].sort().join() !== [...run.ids].sort().join() || preset !== run.changeId;
  const toggle = (id: string) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const hasBA = !!data?.before && !!data?.after;
  return (
    <div style={{ minWidth: 0 }}>
      <form onSubmit={(e) => { e.preventDefault(); if (pick.length) setRun({ ids: pick, changeId: preset }); }}>
        <div style={{ fontWeight: 600, fontSize: 12.5, color: "var(--ink-2)", marginBottom: 6 }}>Giả sử bị chiếm</div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Chọn khu bị chiếm">
          {ids.map((d) => <button key={d.id} type="button" className="sx-tog" style={{ ["--ac" as string]: ACCENT.growth }} aria-pressed={pick.includes(d.id)} onClick={() => toggle(d.id)}>{d.label}</button>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <select className="sx-field" aria-label="Thử một thay đổi" value={preset} onChange={(e) => setPreset(e.target.value)} style={{ maxWidth: "100%", minWidth: 0, flex: "1 1 200px" }}>
            <option value={NO_CHANGE}>Giữ nguyên chính sách</option>
            {presets.map((p) => <option key={p.id} value={p.id}>Thử đơn #{p.id.slice(1)}: {p.label.replace(/^Đơn #\d+: /, "")}</option>)}
          </select>
          <ToyButton type="submit" size="sm" color="violet" disabled={!pick.length} icon={<Play size={14} aria-hidden />} pulse={dirty}>Chạy mô phỏng</ToyButton>
          {isFetching ? <span style={{ fontSize: 12, color: "var(--ink-2)" }}>đang tính…</span> : null}
        </div>
      </form>
      {error ? <div className="sx-callout mt-3">Không chạy được: {(error as Error).message}</div> : null}
      {!data ? <div className="mt-4"><Empty>Chọn khu rồi bấm “Chạy mô phỏng”.</Empty></div> : (
        <div className="mt-5">
          {hasBA ? (
            <div className="grid gap-3">
              <div><div style={{ ...h, fontSize: 14, color: "var(--ink-2)" }}>Trước thay đổi</div><Totals r={data.before as SimResult} dim /></div>
              <div><div style={{ ...h, fontSize: 14 }}>Sau thay đổi</div><Totals r={data.after as SimResult} /></div>
            </div>
          ) : <Totals r={data} />}

          <div style={{ ...h, fontSize: 14, marginTop: 22 }}>Thẻ bị chạm tới ({data.reachedKeys.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {data.reachedKeys.map((k) => {
              const declared = k.via.includes("declared") || k.via.includes("inferred");
              const onchain = k.via.includes("onchain");
              return (
                <span key={k.key} className="sx-chip mono" data-t={onchain ? "teal" : "warn"} title={k.via.join(" + ")} style={{ gap: 8 }}>
                  {k.key}<span style={{ fontFamily: "inherit", fontWeight: 600, opacity: 0.8 }}>{onchain && declared ? "onchain + tự khai" : onchain ? "onchain" : "tự khai"}</span>
                </span>
              );
            })}
          </div>
          <div className="mt-1" style={{ fontSize: 11.5, color: "var(--ink-2)" }}>“Tự khai” là quan hệ do người dùng khai, chain không bảo đảm; chỉ cộng vào ước tính.</div>

          <table className="sx-table mt-4" aria-label="Theo khu">
            <thead><tr><th>Khu</th><th className="r">Chain chặn</th><th className="r">Ước tính</th><th>Ghi chú</th></tr></thead>
            <tbody>{data.perDistrict.map((d) => <tr key={d.principalId}><td><b>{d.principalId}</b></td><td className="r tnum">{d.enforced.display}</td><td className="r tnum">{d.estimated.display}</td><td style={{ color: "var(--ink-2)", fontSize: 12 }}>{d.note}</td></tr>)}</tbody>
          </table>
          <details className="mt-2" onToggle={(e) => setJson((e.target as HTMLDetailsElement).open)} style={{ fontSize: 12 }}>
            <summary style={{ cursor: "pointer", color: "var(--ink-2)", fontWeight: 600 }}>JSON kết quả</summary>
            {json ? <JsonView value={{ totals: data.totals, reachedKeys: data.reachedKeys, perDistrict: data.perDistrict }} maxHeight={260} style={{ marginTop: 6 }} /> : null}
          </details>
        </div>
      )}
    </div>
  );
}

function Rules() {
  const { data: findings } = useFindings();
  const { data: proposals } = useProposals();
  const rows = useMemo(() => RULES.map((r) => {
    const open = (findings ?? []).filter((f) => f.ruleId === r.id);
    const inProposals = (proposals ?? []).flatMap((p) => p.riskReport.findingsAfter.filter((f) => f.ruleId === r.id).map((f) => ({ f, p })));
    const resolvedBy = (proposals ?? []).filter((p) => p.status === "executed" && p.riskReport.findingsBefore.some((f) => f.ruleId === r.id));
    return { r, open, inProposals, resolvedBy };
  }), [findings, proposals]);
  const nOpen = findings?.length ?? 0;
  return (
    <div style={{ minWidth: 0 }}>
      <h3 style={h}>Phát hiện rủi ro <span style={{ fontSize: 13, fontWeight: 700, color: nOpen ? "var(--red-ink)" : "var(--ok-ink)", marginLeft: 6 }}>{nOpen ? `${nOpen} đang mở` : "không còn cái nào mở"}</span></h3>
      <div className="grid gap-2">
        {rows.map(({ r, open, inProposals, resolvedBy }) => {
          const state = open.length ? "open" : inProposals.length ? "warn" : resolvedBy.length ? "fixed" : "clear";
          const color = { open: "#ff2d3d", warn: "#ffb300", fixed: "#22c55e", clear: "#cdbd98" }[state];
          const status = state === "open" ? `${open.length} đang mở` : state === "warn" ? `cảnh báo trong đề xuất #${inProposals.map((x) => x.p.id).join(", #")}` : state === "fixed" ? `đã xử lý bởi #${resolvedBy.map((p) => p.id).join(", #")}` : "không có";
          const sample = open[0] ?? inProposals[0]?.f;
          return (
            <div key={r.id} style={{ background: "#fff", borderRadius: 18, padding: "10px 14px 11px", boxShadow: "0 2px 0 var(--line)", display: "grid", gridTemplateColumns: "10px 1fr", gap: "0 12px" }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, marginTop: 6 }} aria-hidden />
              <div style={{ minWidth: 0 }}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <b className="font-toy" style={{ fontSize: 15 }}>{r.short} · {r.name}</b>
                  <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: state === "open" ? "var(--red-ink)" : state === "warn" ? "var(--amber-ink)" : state === "fixed" ? "var(--ok-ink)" : "var(--ink-2)" }}>{status}</span>
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{sample ? findingDetail(sample) : r.cond}</div>
                <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>Đề xuất tự sinh: {r.fix}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Reference() {
  const { graph, run, data, change } = useRunnerCtx();
  const touched = (graph?.districts ?? []).some((d) => run.ids.includes(d.principalId) && (d.locked || BigInt(d.spentToday.raw) > 0n));
  const ctx = { policyVersion: policyLabel(graph) ?? 0, compromised: run.ids, change, pristine: !touched };
  const ms = REFERENCE.map((r) => matchReference(r, ctx, data));
  const any = ms.includes("match"), bad = ms.includes("mismatch");
  return (
    <div className="mt-7">
      <h3 style={h}>Bảng số mong đợi <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 6, color: bad ? "var(--red-ink)" : any ? "var(--ok-ink)" : "var(--ink-2)" }}>{bad ? "có dòng lệch" : any ? "kết quả hiện tại khớp" : touched ? "chưa đối chiếu được" : "chạy đúng kịch bản để đối chiếu"}</span></h3>
      {touched && !any && !bad ? <p style={{ margin: "-4px 0 8px", fontSize: 12.5, color: "var(--ink-2)" }}>Khu đã có chi tiêu hoặc bị khoá nên số khác bảng seed. Đặt lại kịch bản để đối chiếu.</p> : null}
      <div className="sx-scroll"><table className="sx-table" aria-label="Bảng số mong đợi">
        <thead><tr><th style={{ width: 28 }}></th><th>Trạng thái</th><th>Khu bị chiếm</th><th className="r">Bạn nghĩ</th><th className="r">Chain chặn</th><th className="r">Ước tính</th></tr></thead>
        <tbody>
          {REFERENCE.map((r, i) => (
            <tr key={r.id} data-m={ms[i]} style={{ background: ms[i] === "match" ? "var(--ok-soft)" : ms[i] === "mismatch" ? "var(--red-soft)" : undefined, opacity: ms[i] === "other" ? 0.75 : 1 }}>
              <td style={{ fontWeight: 800, fontSize: 15, color: ms[i] === "match" ? "var(--ok-ink)" : ms[i] === "mismatch" ? "var(--red-ink)" : "#c4b48e" }} title={ms[i] === "match" ? "khớp kết quả hiện tại" : ms[i] === "mismatch" ? "cùng kịch bản nhưng số lệch" : "không phải kịch bản đang xem"}>{ms[i] === "match" ? "✓" : ms[i] === "mismatch" ? "✕" : "·"}</td>
              <td>{r.label}</td>
              <td>{r.picked.join(" + ")}</td>
              {([r.youThink, r.enforced, r.estimated] as number[]).map((n, j) => <td key={j} className="r tnum" style={{ fontWeight: ms[i] === "match" ? 800 : 500 }}>{n.toLocaleString("vi-VN")}</td>)}
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
export default Simulation;
