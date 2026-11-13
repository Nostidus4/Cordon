// Building drawer (slot "drawer"): the right-hand panel of a picked building, in ANY scene. Four tabs, little text:
// Tổng quan (what it does, why this colour, last 3 things), Luật (rules, active one highlighted), Sự cố (only when this building has an
// incident: 5 steps + Council approve buttons) and Thử gây sự cố (demo mode only). Technical names appear only in the muted "Bên trong" line.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { STATE_LABEL } from "../city3d/buildings";
import { useActions } from "../hooks/useActions";
import { useBuildingDetail, useBuildingInfos, useFaults, useIncidents, useLatestAgentRun } from "../hooks/useBuildings";
import { useHealth } from "../hooks/useHealth";
import { useOrg } from "../hooks/useOrg";
import { useProposals } from "../hooks/useProposals";
import { ApiError, api } from "../lib/api";
import { INCIDENT_STATUS_VI, actionOutcomeVi, awaitsCouncil, faultsOfBuilding, reasonTextVi, shortHash, stepViews } from "../lib/ops";
import { MEMBER_SHORT, approvalSlots } from "../pages/requests/logic";
import { BUILDING_BY_ID, type BuildingId, type RuleState } from "../shared/buildings";
import type { AgentRun, BuildingDetail, BuildingEvidence, FaultAction, FaultDef, FaultResult, Incident, MemberId } from "../types";
import { CopilotPanel } from "./CopilotPanel";
import { useStageStore, type DrawerTab } from "./stageStore";
import { TxGuardPanel } from "./TxGuardPanel";
import { CheckIcon, CrossIcon, FaceAvatar, ToyButton, ToyCard } from "./ui";

export const STATE_TONE: Record<RuleState, { dot: string; soft: string; ink: string }> = {
  normal: { dot: "var(--green)", soft: "var(--teal-soft)", ink: "var(--teal-ink)" },
  warning: { dot: "var(--amber)", soft: "var(--amber-soft)", ink: "var(--amber-ink)" },
  incident: { dot: "var(--red)", soft: "var(--red-soft)", ink: "var(--red-ink)" },
  recovery: { dot: "var(--blue)", soft: "var(--blue-soft)", ink: "#0b3d99" },
};

function SimTag() {
  return <span className="rounded-full px-2 py-px text-[11px] font-bold" style={{ background: "#e9defc", color: "var(--violet-d)" }}>giả lập</span>;
}
const Hash = ({ h, sim }: { h: string; sim?: boolean }) => (
  <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px]" style={{ color: "var(--ink-2)" }} title={h}>{shortHash(h)}{sim ? <SimTag /> : null}</span>
);

function evidenceLine(e: BuildingEvidence | undefined) {
  if (!e) return null;
  const text = e.kind === "reasonCode" ? reasonTextVi(e.value) : null;
  if (!text && !e.txHash) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-semibold" data-evidence>
      {text ? <span style={{ color: "var(--red-ink)" }}>{text}</span> : null}
      {e.txHash ? <Hash h={e.txHash} sim={e.simulated} /> : null}
    </div>
  );
}

function Overview({ d, summary, module, topic, run }: { d: BuildingDetail; summary: string; module: string; topic: string; run: AgentRun | null }) {
  const tone = STATE_TONE[d.state];
  const ev = d.evidence.find((e) => e.kind === "reasonCode" || e.txHash);
  return (
    <div className="flex flex-col gap-2.5">
      <p className="toy-body m-0 line-clamp-2" style={{ fontSize: 13.5, lineHeight: 1.35 }}>{summary}</p>
      <div className="rounded-[14px] px-3 py-2" style={{ background: tone.soft, border: `2px solid ${tone.dot}` }} data-state={d.state}>
        <div className="text-[13.5px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>{d.reasonVi}</div>
        {evidenceLine(ev)}
      </div>
      {run?.steps?.length ? (
        <div className="flex items-center gap-1.5" aria-label="Các bước của agent" role="list">
          {run.steps.map((s) => (
            <span key={s.key} role="listitem" title={`${s.labelVi}: ${s.status === "ok" ? "xong" : s.status === "blocked" ? "bị chặn" : "bỏ qua"}`} data-step={s.key} data-status={s.status}
              className="rounded-full px-2 py-0.5 text-[12px] font-bold" style={{ background: s.status === "ok" ? "var(--teal-soft)" : s.status === "blocked" ? "var(--red-soft)" : "#f1e4cc", color: s.status === "ok" ? "var(--teal-ink)" : s.status === "blocked" ? "var(--red-ink)" : "var(--ink-2)" }}>{s.labelVi}</span>
          ))}
        </div>
      ) : null}
      <div>
        <div className="toy-eyebrow" style={{ fontSize: 13.5 }}>Vừa xảy ra</div>
        {d.recent.length === 0 ? <p className="toy-body m-0" style={{ fontSize: 13 }}>Chưa có gì.</p> : (
          <ul className="m-0 mt-0.5 flex list-none flex-col gap-1 p-0">
            {d.recent.slice(0, 3).map((r, i) => (
              <li key={i} className="line-clamp-2 text-[12.5px] leading-snug" style={{ color: "var(--ink)" }}>
                {r.summaryVi}{r.txHash ? <> <Hash h={r.txHash} sim={r.simulated} /></> : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="m-0 border-t-2 border-dashed pt-2 text-[11.5px] font-semibold" style={{ borderColor: "#ecdcbc", color: "var(--ink-2)" }} data-inside>Bên trong: {module} · đề {topic}</p>
    </div>
  );
}

function Rules({ d }: { d: BuildingDetail }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label="Các luật đổi màu">
      {d.rules.map((r) => {
        const t = STATE_TONE[r.state === "worst" ? d.state : r.state]; // B08.worst takes the colour it currently resolves to
        return (
          <li key={r.id} data-rule={r.id} data-active={r.active ? "true" : "false"} className="flex items-start gap-2 rounded-[12px] px-2.5 py-1.5 text-[13.5px] leading-snug"
            style={{ background: r.active ? t.soft : "transparent", border: `2px solid ${r.active ? t.dot : "#f1e4cc"}`, color: "var(--ink)", fontWeight: r.active ? 700 : 500 }}>
            <span className="mt-[5px] size-2.5 shrink-0 rounded-full" style={{ background: t.dot, opacity: r.active ? 1 : 0.55 }} aria-hidden />
            <span className="min-w-0 flex-1">{r.whenVi}</span>
            {r.active ? <span className="shrink-0 text-[11px] font-bold" style={{ color: t.ink }}>đang áp dụng</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function IncidentTab({ inc, demo }: { inc: Incident; demo: boolean }) {
  const { data: proposals } = useProposals();
  const { data: org } = useOrg();
  const actions = useActions();
  const steps = stepViews(inc);
  const proposal = awaitsCouncil(inc) ? proposals?.find((p) => p.id === inc.proposalId) : undefined;
  const slots = proposal ? approvalSlots(proposal, org?.council.members ?? []) : [];
  return (
    <div className="flex flex-col gap-2.5" data-incident-tab={inc.id}>
      <div className="flex items-start justify-between gap-2">
        <div className="font-toy text-[17px] font-bold leading-tight" style={{ color: "var(--ink)" }}>{inc.titleVi}</div>
        <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: "#ffd9d2", color: "var(--red-d)" }}>{INCIDENT_STATUS_VI[inc.status]}</span>
      </div>
      <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Các bước xử lý sự cố">
        {steps.map((s) => {
          const bg = s.tone === "done" ? "var(--teal)" : s.tone === "active" ? "var(--violet)" : s.tone === "skipped" ? "#e6dcc8" : "#fff";
          return (
            <li key={s.key} className="flex items-start gap-2.5" data-step={s.key} data-tone={s.tone} aria-current={s.tone === "active" ? "step" : undefined}>
              <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[12px] font-bold ${s.tone === "active" ? "toy-live" : ""}`}
                style={{ background: bg, border: `3px solid ${s.tone === "pending" ? "#d9c49b" : s.tone === "skipped" ? "#cdbd9b" : "transparent"}`, color: s.tone === "done" ? "#053b36" : s.tone === "active" ? "#fff" : "var(--ink-2)" }}>
                {s.tone === "done" ? <CheckIcon size={13} /> : s.tone === "skipped" ? "–" : s.index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-bold leading-tight" style={{ color: s.tone === "pending" || s.tone === "skipped" ? "var(--ink-2)" : "var(--ink)" }}>{s.label}</span>
                {s.detail ? <span className="block text-[12.5px] font-medium leading-snug" style={{ color: "var(--ink-2)" }}>{s.detail}</span> : null}
                {s.txHash ? <Hash h={s.txHash} sim /> : null}
              </span>
            </li>
          );
        })}
      </ol>
      {awaitsCouncil(inc) ? (
        <div className="rounded-[14px] p-2.5" style={{ background: "#f6ecd9", border: "2px solid #ecdcbc" }}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-toy text-[15px] font-bold" style={{ color: "var(--ink)" }}>Hội đồng cần {proposal?.threshold ?? 2}/3 phiếu</span>
            {proposal ? <span className="text-[13px] font-bold" style={{ color: "var(--ink-2)" }}>{proposal.approvals.length}/{proposal.threshold}</span> : null}
          </div>
          {demo && proposal ? (
            <div className="mt-2 flex gap-1.5" role="group" aria-label="Duyệt với tư cách thành viên Hội đồng">
              {slots.map((s) => (
                <ToyButton key={s.member} size="xs" color={s.state === "approved" ? "teal" : "green"} done={s.state === "approved"} title={s.disabledReason} className="flex-1 !px-2"
                  disabled={!s.canApprove || actions.approve.isPending} icon={<FaceAvatar member={s.member} size={22} dim={!s.canApprove && s.state !== "approved"} />}
                  onClick={() => actions.approve.mutate({ id: inc.proposalId, member: s.member as MemberId })}>
                  {MEMBER_SHORT[s.member]}
                </ToyButton>
              ))}
            </div>
          ) : <p className="toy-body m-0 mt-1" style={{ fontSize: 12.5 }}>Chờ các thành viên Hội đồng ký bằng ví của họ.</p>}
        </div>
      ) : null}
    </div>
  );
}

function ActionRow({ a }: { a: FaultAction }) {
  return (
    <li className="flex items-start gap-1.5 text-[12.5px] leading-snug" style={{ color: "var(--ink)" }}>
      <span className="mt-[3px] shrink-0" style={{ color: a.ok ? "var(--teal-ink)" : "var(--red-ink)" }}>{a.ok ? <CheckIcon size={13} /> : <CrossIcon size={13} />}</span>
      <span className="min-w-0">
        <span className="font-semibold">{a.labelVi}</span>
        <span className="block font-bold" style={{ color: a.ok ? "var(--teal-ink)" : "var(--red-ink)" }}>{actionOutcomeVi(a)}</span>
        {a.txHash ? <Hash h={a.txHash} sim={a.simulated} /> : null}
      </span>
    </li>
  );
}

/** "3 bị chặn · 2 chạy được" */
export const resultSummary = (r: FaultResult): string => {
  const blocked = r.actions.filter((a) => !a.ok).length, ok = r.actions.length - blocked;
  return [blocked ? `${blocked} bị chặn` : null, ok ? `${ok} chạy được` : null].filter(Boolean).join(" · ") || "Không có hành động";
};

function Faults({ building, faults }: { building: BuildingId; faults: FaultDef[] }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<FaultResult | null>(null);
  const [error, setError] = useState<{ id: string; msg: string } | null>(null);
  const inject = useMutation({
    mutationFn: (id: string) => api.injectFault(id),
    onMutate: () => { setError(null); setResult(null); },
    onSuccess: (r) => { setResult(r); void qc.invalidateQueries({ queryKey: ["incidents"] }); void qc.invalidateQueries({ queryKey: ["building"] }); void qc.invalidateQueries({ queryKey: ["city"] }); },
    onError: (e, id) => setError({ id, msg: e instanceof ApiError ? e.message : "Không gây được sự cố" }),
  });
  useEffect(() => { setResult(null); setError(null); }, [building]);
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {faults.map((f) => (
        <li key={f.id} data-fault={f.id} className="rounded-[14px] p-2.5" style={{ background: "#f6ecd9", border: "2px solid #ecdcbc" }}>
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-toy text-[15px] font-bold leading-tight" style={{ color: "var(--ink)" }}>{f.titleVi}</div>
              <div className="toy-body line-clamp-2" style={{ fontSize: 12.5, lineHeight: 1.3 }} title={`${f.whatVi} ${f.expectVi}`}>{f.whatVi}</div>
            </div>
            <ToyButton size="xs" color="red" disabled={inject.isPending} onClick={() => inject.mutate(f.id)}>{inject.isPending && inject.variables === f.id ? "Đang gây…" : "Gây sự cố"}</ToyButton>
          </div>
          {error?.id === f.id ? <p role="alert" className="m-0 mt-1.5 text-[12.5px] font-bold" style={{ color: "var(--red-ink)" }}>{error.msg}</p> : null}
          {result?.faultId === f.id ? (
            <div className="mt-1.5 text-[12.5px]" aria-live="polite" data-fault-result>
              <span className="font-bold" style={{ color: "var(--ink)" }}>{resultSummary(result)}</span>
              <details className="mt-1"><summary className="cursor-pointer font-bold" style={{ color: "var(--violet-d)" }}>Xem chi tiết</summary>
                <ul className="m-0 mt-1 flex list-none flex-col gap-1.5 p-0">{result.actions.map((a, i) => <ActionRow key={i} a={a} />)}</ul>
              </details>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const TAB_LABEL: Record<DrawerTab, string> = { overview: "Tổng quan", rules: "Luật", incident: "Sự cố", faults: "Thử lỗi" };

export function BuildingDrawer({ code }: { code: BuildingId }) {
  const infos = useBuildingInfos();
  const info = infos.find((b) => b.id === code) ?? BUILDING_BY_ID[code];
  const detail = useBuildingDetail(code);
  const d = detail.data;
  const demo = !!useHealth().data?.demoMode;
  const faultsQ = useFaults(demo);
  const run = useLatestAgentRun(code === "B06");
  const { data: open } = useIncidents("open");
  const inc = (open ?? []).filter((i) => i.building === code).sort((a, b) => b.id - a.id)[0] ?? null;
  const requested = useStageStore((s) => s.drawerTab);
  const [chosen, setChosen] = useState<DrawerTab | null>(null);
  useEffect(() => { setChosen(null); }, [code, requested]);

  // frame the picked building (it sits left of the drawer); hand the camera back on close
  useEffect(() => {
    useStageStore.getState().setShotOverride({ building: code });
    return () => useStageStore.getState().setShotOverride(null);
  }, [code]);

  const faults = d && faultsQ.data ? faultsOfBuilding(faultsQ.data, code).filter((f) => d.faults.includes(f.id)) : [];
  const tabs: DrawerTab[] = ["overview", "rules", ...(inc ? ["incident" as const] : []), ...(demo && faults.length ? ["faults" as const] : [])];
  const want = chosen ?? requested ?? (inc ? "incident" : "overview");
  const tab = tabs.includes(want) ? want : "overview";
  const state = d?.state ?? "normal";
  const tone = STATE_TONE[state];
  const close = () => { const s = useStageStore.getState(); s.setPicked(null); s.setDrawerTab(null); };

  return (
    <div className="stage-drawer" data-slot="drawer" data-building-drawer={code}>
      <ToyCard className="flex w-full flex-col overflow-hidden p-3.5" label={`Bên trong ${info.name}`} key={code}>
        <div className="flex items-center gap-2.5">
          <span className="size-4 shrink-0 rounded-full" style={{ background: tone.dot, boxShadow: "0 0 0 3px #fff" }} aria-hidden />
          <div className="min-w-0 flex-1 truncate font-toy text-[20px] font-bold leading-tight" style={{ color: "var(--ink)" }}>{info.name}</div>
          <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[12.5px] font-bold" style={{ background: tone.soft, color: tone.ink, border: `2px solid ${tone.dot}` }}>{STATE_LABEL[state]}</span>
          <button type="button" aria-label="Đóng" onClick={close} className="grid size-9 shrink-0 place-items-center rounded-full border-0 bg-[#f1e4cc]" style={{ color: "var(--ink)", cursor: "pointer" }}><X size={17} strokeWidth={3} /></button>
        </div>
        <div className="toy-pill-toggle mt-2.5 flex-wrap self-start" role="tablist" aria-label="Các mục">
          {tabs.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} aria-pressed={tab === t} data-tab={t} onClick={() => setChosen(t)} style={{ minHeight: 40, padding: "6px 14px 5px", color: t === "incident" && tab !== t ? "var(--red-ink)" : undefined }}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="toy-scroll mt-3 min-h-0 flex-1 overflow-y-auto pr-1" role="tabpanel">
          {!d ? <p className="toy-body m-0" role="status">{detail.isError ? "Chưa đọc được trạng thái tòa này." : "Đang đọc…"}</p>
            : tab === "overview" ? <><Overview d={d} summary={info.summaryVi} module={info.module} topic={info.topic} run={run.data ?? null} />{code === "B05" ? <TxGuardPanel /> : null}</>
            : tab === "rules" ? <Rules d={d} />
            : tab === "incident" && inc ? <IncidentTab inc={inc} demo={demo} />
            : <><div className="toy-eyebrow mb-1.5" style={{ fontSize: 14 }}>Thử gây sự cố</div><Faults building={code} faults={faults} /></>}
          {code === "B02" && tab === "overview" ? <CopilotPanel /> : null}
        </div>
      </ToyCard>
    </div>
  );
}
