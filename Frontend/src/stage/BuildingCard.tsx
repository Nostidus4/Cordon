// "Bên trong tòa": the card of a picked building, in ANY scene. Name, what it does, colour + the rule behind it, evidence, recent activity,
// the B06 agent timeline and (demo mode only) the faults that can be injected here. Technical names appear only in the small muted "Bên trong" line.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { STATE_LABEL } from "../city3d/buildings";
import { useBuildingDetail, useBuildingInfos, useFaults, useLatestAgentRun } from "../hooks/useBuildings";
import { useHealth } from "../hooks/useHealth";
import { ApiError, api } from "../lib/api";
import { actionOutcomeVi, faultsOfBuilding, reasonTextVi, shortHash } from "../lib/ops";
import { BUILDING_BY_ID, type BuildingId, type RuleState } from "../shared/buildings";
import type { AgentRun, BuildingDetail, BuildingEvidence, FaultAction, FaultDef, FaultResult } from "../types";
import { useStageStore } from "./stageStore";
import { CheckIcon, CrossIcon, ToyButton, ToyCard } from "./ui";

export const STATE_TONE: Record<RuleState, { dot: string; soft: string; ink: string }> = {
  normal: { dot: "var(--green)", soft: "var(--teal-soft)", ink: "var(--teal-ink)" },
  warning: { dot: "var(--amber)", soft: "var(--amber-soft)", ink: "var(--amber-ink)" },
  incident: { dot: "var(--red)", soft: "var(--red-soft)", ink: "var(--red-ink)" },
  recovery: { dot: "var(--blue)", soft: "var(--blue-soft)", ink: "#0b3d99" },
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="mt-3">
    <div className="toy-eyebrow" style={{ fontSize: 14 }}>{title}</div>
    {children}
  </div>
);

function SimTag() {
  return <span className="rounded-full px-2 py-px text-[11px] font-bold" style={{ background: "#e9defc", color: "var(--violet-d)" }}>giả lập</span>;
}

function EvidenceLine({ e }: { e: BuildingEvidence }) {
  const text = e.kind === "reasonCode" ? reasonTextVi(e.value) : null;
  if (!text && !e.txHash) return null;
  return (
    <li className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>
      {text ? <span style={{ color: "var(--red-ink)" }}>{text}</span> : null}
      {e.txHash ? <><span className="font-mono" title={e.txHash}>{shortHash(e.txHash)}</span>{e.simulated ? <SimTag /> : null}</> : null}
    </li>
  );
}

function RuleList({ d }: { d: BuildingDetail }) {
  return (
    <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0" aria-label="Các luật đổi màu">
      {d.rules.map((r) => {
        const t = STATE_TONE[r.state === "worst" ? d.state : r.state]; // B08.worst takes the colour it currently resolves to
        return (
          <li key={r.id} data-rule={r.id} data-active={r.active ? "true" : "false"} className="flex items-start gap-2 rounded-[12px] px-2 py-1 text-[13px] leading-snug"
            style={{ background: r.active ? t.soft : "transparent", border: `2px solid ${r.active ? t.dot : "transparent"}`, color: "var(--ink)", fontWeight: r.active ? 700 : 500 }}>
            <span className="mt-[5px] size-2.5 shrink-0 rounded-full" style={{ background: t.dot, opacity: r.active ? 1 : 0.55 }} aria-hidden />
            <span className="min-w-0 flex-1">{r.whenVi}</span>
            {r.active ? <span className="shrink-0 text-[11px] font-bold" style={{ color: t.ink }}>đang áp dụng</span> : null}
          </li>
        );
      })}
    </ul>
  );
}

function AgentTimeline({ run }: { run: AgentRun }) {
  const steps = run.steps ?? [];
  const mark = (s: string) => (s === "ok" ? <CheckIcon size={13} /> : s === "blocked" ? <CrossIcon size={13} /> : <span aria-hidden>–</span>);
  return (
    <Section title="Lần chạy gần nhất">
      <ol className="m-0 mt-1 flex list-none flex-col gap-1 p-0" aria-label="Các bước của agent">
        {steps.map((s, i) => {
          const c = s.status === "ok" ? "var(--teal-ink)" : s.status === "blocked" ? "var(--red-ink)" : "var(--ink-2)";
          const extra = s.key === "simulate" && s.status === "blocked" ? reasonTextVi(run.reasonCode)
            : s.key === "send" && run.txHash ? shortHash(run.txHash) : "";
          return (
            <li key={s.key} className="flex items-center gap-2 text-[13px] font-semibold" style={{ color: "var(--ink)" }} data-step={s.key} data-status={s.status}>
              <span className="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold" style={{ background: "#fff", color: c, border: `2px solid ${c}` }}>{mark(s.status)}</span>
              <span>{i + 1}. {s.labelVi}</span>
              {extra ? <span className="truncate text-[12px] font-semibold" style={{ color: c }}>{extra}</span> : null}
              {s.status === "skipped" ? <span className="text-[12px]" style={{ color: "var(--ink-2)" }}>bỏ qua</span> : null}
            </li>
          );
        })}
      </ol>
      {run.untrustedInput ? (
        <p className="m-0 mt-1.5 rounded-[12px] px-2 py-1 text-[12.5px] font-semibold" style={{ background: "var(--amber-soft)", color: "var(--amber-ink)" }}>
          Văn bản lạ: "{run.untrustedInput}"{run.injectionIgnored ? ". Agent đã bỏ qua." : ""}
        </p>
      ) : null}
    </Section>
  );
}

function ActionRow({ a }: { a: FaultAction }) {
  return (
    <li className="flex items-start gap-1.5 text-[12.5px] leading-snug" style={{ color: "var(--ink)" }}>
      <span className="mt-[3px] shrink-0" style={{ color: a.ok ? "var(--teal-ink)" : "var(--red-ink)" }}>{a.ok ? <CheckIcon size={13} /> : <CrossIcon size={13} />}</span>
      <span className="min-w-0">
        <span className="font-semibold">{a.labelVi}</span>
        <span className="block font-bold" style={{ color: a.ok ? "var(--teal-ink)" : "var(--red-ink)" }}>{actionOutcomeVi(a)}</span>
        {a.txHash ? <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px]" style={{ color: "var(--ink-2)" }}>{shortHash(a.txHash)}{a.simulated ? <SimTag /> : null}</span> : null}
      </span>
    </li>
  );
}

function FaultMenu({ building, faults }: { building: BuildingId; faults: FaultDef[] }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<FaultResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inject = useMutation({
    mutationFn: (id: string) => api.injectFault(id),
    onMutate: () => { setError(null); setResult(null); },
    onSuccess: (r) => { setResult(r); void qc.invalidateQueries({ queryKey: ["incidents"] }); void qc.invalidateQueries({ queryKey: ["building"] }); void qc.invalidateQueries({ queryKey: ["city"] }); },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Không gây được sự cố"),
  });
  useEffect(() => { setResult(null); setError(null); }, [building]);
  if (!faults.length) return null;
  return (
    <Section title="Thử gây sự cố">
      <ul className="m-0 mt-1 flex list-none flex-col gap-2 p-0">
        {faults.map((f) => (
          <li key={f.id} className="rounded-[14px] p-2" style={{ background: "#f6ecd9", border: "2px solid #ecdcbc" }} data-fault={f.id}>
            <div className="font-toy text-[15.5px] font-bold leading-tight" style={{ color: "var(--ink)" }}>{f.titleVi}</div>
            <div className="toy-body" style={{ fontSize: 12.5, lineHeight: 1.35 }}>{f.whatVi}</div>
            <div className="toy-body" style={{ fontSize: 12.5, lineHeight: 1.35, color: "var(--teal-ink)" }}>{f.expectVi}</div>
            <div className="mt-1.5"><ToyButton size="xs" color="red" disabled={inject.isPending} onClick={() => inject.mutate(f.id)}>{inject.isPending && inject.variables === f.id ? "Đang gây…" : "Gây sự cố"}</ToyButton></div>
          </li>
        ))}
      </ul>
      {error ? <p role="alert" className="m-0 mt-2 text-[13px] font-bold" style={{ color: "var(--red-ink)" }}>{error}</p> : null}
      {result ? (
        <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0" aria-live="polite" aria-label="Kết quả gây sự cố">
          {result.actions.map((a, i) => <ActionRow key={i} a={a} />)}
        </ul>
      ) : null}
    </Section>
  );
}

export function BuildingCard({ code }: { code: BuildingId }) {
  const infos = useBuildingInfos();
  const info = infos.find((b) => b.id === code) ?? BUILDING_BY_ID[code];
  const detail = useBuildingDetail(code);
  const d = detail.data;
  const health = useHealth();
  const demo = !!health.data?.demoMode;
  const faultsQ = useFaults(demo);
  const run = useLatestAgentRun(code === "B06");
  const close = () => useStageStore.getState().setPicked(null);
  const state = d?.state ?? "normal";
  const tone = STATE_TONE[state];
  const faults = d && faultsQ.data ? faultsOfBuilding(faultsQ.data, code).filter((f) => d.faults.includes(f.id)) : [];
  const evidence = (d?.evidence ?? []).filter((e) => e.kind === "reasonCode" || e.txHash);

  return (
    <div className="absolute left-6 top-24 z-30" data-building-card={code}>
      <ToyCard className="toy-scroll w-[min(310px,calc(100vw-48px))] overflow-y-auto p-4" style={{ maxHeight: "calc(100vh - 150px)" }} label={`Bên trong ${info.name}`} key={code}>
        <div className="flex items-start gap-2.5">
          <span className="mt-1.5 size-4 shrink-0 rounded-full" style={{ background: tone.dot, boxShadow: "0 0 0 3px #fff" }} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="font-toy text-[21px] font-bold leading-tight" style={{ color: "var(--ink)" }}>{info.name}</div>
            <p className="toy-body m-0 mt-0.5" style={{ fontSize: 13.5, lineHeight: 1.35 }}>{info.summaryVi}</p>
          </div>
          <button type="button" aria-label="Đóng" onClick={close} className="grid size-8 shrink-0 place-items-center rounded-full border-0 bg-[#f1e4cc]" style={{ color: "var(--ink)", cursor: "pointer" }}><X size={16} strokeWidth={3} /></button>
        </div>

        {d ? (
          <>
            <div className="mt-2.5 rounded-[14px] px-3 py-2" style={{ background: tone.soft, border: `2px solid ${tone.dot}` }} data-state={state}>
              <div className="font-toy text-[15px] font-bold" style={{ color: tone.ink }}>{STATE_LABEL[state]}</div>
              <div className="text-[13px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>{d.reasonVi}</div>
            </div>
            <Section title="Luật đổi màu"><RuleList d={d} /></Section>
            {evidence.length ? (
              <Section title="Bằng chứng"><ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">{evidence.map((e, i) => <EvidenceLine key={i} e={e} />)}</ul></Section>
            ) : null}
            {code === "B06" && run.data ? <AgentTimeline run={run.data} /> : null}
            <Section title="Vừa xảy ra">
              {d.recent.length === 0 ? <p className="toy-body m-0 mt-1" style={{ fontSize: 13 }}>Chưa có gì.</p> : (
                <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
                  {d.recent.slice(0, 5).map((r, i) => (
                    <li key={i} className="text-[12.5px] leading-snug" style={{ color: "var(--ink)" }}>
                      {r.summaryVi}
                      {r.txHash ? <span className="ml-1.5 inline-flex items-center gap-1 font-mono text-[11.5px]" style={{ color: "var(--ink-2)" }}>{shortHash(r.txHash)}{r.simulated ? <SimTag /> : null}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            {demo ? <FaultMenu building={code} faults={faults} /> : null}
          </>
        ) : (
          <p className="toy-body m-0 mt-3" role="status">{detail.isError ? "Chưa đọc được trạng thái tòa này." : "Đang đọc…"}</p>
        )}

        <p className="m-0 mt-3 border-t-2 border-dashed pt-2 text-[11.5px] font-semibold" style={{ borderColor: "#ecdcbc", color: "var(--ink-2)" }} data-inside>
          Bên trong: {info.module} · đề {info.topic}
        </p>
      </ToyCard>
    </div>
  );
}
