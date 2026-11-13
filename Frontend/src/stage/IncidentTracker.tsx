// Incident tracker: appears on every scene while the responder has an open incident (GET /incidents?status=open + stream `incident_updated`).
// Five steps (detect > contain > propose > recover > verify), detail of the current step, and, when the Council has to decide, the approve buttons
// (same endpoint and slot logic as the request scene). The camera frames the affected building for a few seconds when an incident shows up.
import { useEffect, useRef } from "react";
import { useActions } from "../hooks/useActions";
import { useHealth } from "../hooks/useHealth";
import { useIncidents } from "../hooks/useBuildings";
import { useOrg } from "../hooks/useOrg";
import { useProposals } from "../hooks/useProposals";
import { INCIDENT_STATUS_VI, awaitsCouncil, currentStep, incidentShot, pickTrackedIncident, shortHash, stepViews, type StepView } from "../lib/ops";
import { MEMBER_FULL, approvalSlots } from "../pages/requests/logic";
import { buildingName } from "../shared/buildings";
import type { MemberId } from "../types";
import { useStageStore } from "./stageStore";
import { CheckIcon, FaceAvatar, ToyButton, ToyCard, WarnIcon } from "./ui";

const FRAME_MS = 7000;

function StepDot({ s }: { s: StepView }) {
  const t = s.tone;
  const bg = t === "done" ? "var(--teal)" : t === "active" ? "var(--violet)" : t === "skipped" ? "#e6dcc8" : "#fff";
  const bd = t === "pending" ? "#d9c49b" : t === "skipped" ? "#cdbd9b" : "transparent";
  return (
    <li className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center" data-step={s.key} data-tone={t} aria-current={t === "active" ? "step" : undefined}>
      <span className={`grid size-7 place-items-center rounded-full text-[13px] font-bold ${t === "active" ? "toy-live" : ""}`}
        style={{ background: bg, border: `3px solid ${bd}`, color: t === "done" ? "#053b36" : t === "active" ? "#fff" : "var(--ink-2)" }}>
        {t === "done" ? <CheckIcon size={14} /> : t === "skipped" ? "–" : s.index + 1}
      </span>
      <span className="text-[12px] font-bold leading-tight" style={{ color: t === "pending" || t === "skipped" ? "var(--ink-2)" : "var(--ink)" }}>{s.label}</span>
    </li>
  );
}

export function IncidentTracker({ top = 84 }: { top?: number }) {
  const { data: list } = useIncidents("open");
  const inc = pickTrackedIncident(list);
  const health = useHealth();
  const demo = !!health.data?.demoMode;
  const { data: proposals } = useProposals();
  const { data: org } = useOrg();
  const actions = useActions();

  // frame the affected building when an incident shows up (or a new one starts), then hand the camera back to the scene
  const framed = useRef<number | null>(null);
  const id = inc?.id ?? null;
  const building = inc?.building ?? null;
  useEffect(() => {
    if (id == null || building == null || framed.current === id) return;
    framed.current = id;
    useStageStore.getState().setShotOverride(incidentShot({ building }));
    const t = setTimeout(() => useStageStore.getState().setShotOverride(null), FRAME_MS);
    return () => clearTimeout(t);
  }, [id, building]);

  if (!inc) return null;
  const steps = stepViews(inc);
  const cur = currentStep(inc);
  const proposal = awaitsCouncil(inc) ? proposals?.find((p) => p.id === inc.proposalId) : undefined;
  const slots = proposal ? approvalSlots(proposal, org?.council.members ?? []) : [];

  return (
    <div className="pointer-events-none absolute left-1/2 z-30 -translate-x-1/2" style={{ top }} data-incident-tracker={inc.id}>
      <ToyCard tone="red" className="w-[min(620px,calc(100vw-32px))] px-4 pb-3 pt-3 min-[1200px]:w-[min(620px,calc(100vw-760px))]" label="Sự cố đang xử lý">
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--red-ink)" }}><WarnIcon size={18} /></span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-toy text-[18px] font-bold leading-tight" style={{ color: "var(--ink)" }}>{inc.titleVi}</div>
            <div className="text-[12.5px] font-semibold" style={{ color: "var(--ink-2)" }}>{buildingName(inc.building)}</div>
          </div>
          <span className="shrink-0 rounded-full px-3 py-0.5 text-[13px] font-bold" style={{ background: "#ffd9d2", color: "var(--red-d)" }} data-status={inc.status}>{INCIDENT_STATUS_VI[inc.status]}</span>
        </div>
        <ol className="m-0 mt-2.5 flex list-none gap-1 p-0" aria-label="Các bước xử lý sự cố">{steps.map((s) => <StepDot key={s.key} s={s} />)}</ol>
        {cur ? (
          <p className="m-0 mt-2 text-[13.5px] font-semibold leading-snug" style={{ color: "var(--ink)" }}>
            {cur.detailVi || cur.labelVi}
            {cur.txHash ? <span className="ml-2 font-mono text-[12px]" style={{ color: "var(--ink-2)" }}>{shortHash(cur.txHash)}</span> : null}
          </p>
        ) : null}
        {awaitsCouncil(inc) ? (
          <div className="mt-2.5 border-t-2 border-dashed pt-2.5" style={{ borderColor: "#f2c2b8" }}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-toy text-[15px] font-bold" style={{ color: "var(--ink)" }}>Hội đồng cần {proposal?.threshold ?? 2} trong 3 phiếu</span>
              {proposal ? <span className="text-[13px] font-bold" style={{ color: "var(--ink-2)" }}>{proposal.approvals.length}/{proposal.threshold} phiếu</span> : null}
            </div>
            {demo && proposal ? (
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Duyệt với tư cách thành viên Hội đồng">
                {slots.map((s) => (
                  <ToyButton key={s.member} size="sm" color={s.state === "approved" ? "teal" : "green"} done={s.state === "approved"} title={s.disabledReason}
                    disabled={!s.canApprove || actions.approve.isPending} icon={<FaceAvatar member={s.member} size={24} dim={!s.canApprove && s.state !== "approved"} />}
                    onClick={() => actions.approve.mutate({ id: inc.proposalId, member: s.member as MemberId })}>
                    {s.state === "approved" ? `${MEMBER_FULL[s.member]} đã duyệt` : `Duyệt: ${MEMBER_FULL[s.member]}`}
                  </ToyButton>
                ))}
              </div>
            ) : (
              <p className="toy-body m-0 mt-1" style={{ fontSize: 13 }}>Chờ các thành viên Hội đồng ký bằng ví của họ.</p>
            )}
          </div>
        ) : null}
      </ToyCard>
    </div>
  );
}
