// The single thin status strip under the top bar (slot "status-strip"): EITHER the "Đang ở chính sách mới" pill OR the incident strip
// (incident wins; when both apply they merge into one strip). Incident strip = warning icon, short title, 5 step dots, status chip, "Xem".
// "Xem" opens the building drawer on the "Sự cố" tab. A new incident also frames its building for a few seconds.
import { useEffect, useRef } from "react";
import { useIncidents } from "../hooks/useBuildings";
import { INCIDENT_STATUS_VI, incidentShot, pickTrackedIncident, stepViews } from "../lib/ops";
import { buildingName } from "../shared/buildings";
import type { BuildingCode } from "./contract";
import { openBuilding, useStageStore } from "./stageStore";
import { ToyButton, ToyCard, WarnIcon } from "./ui";

const FRAME_MS = 7000;

export function StatusStrip({ policyNew, onReset, drawerOpen }: { policyNew: boolean; onReset: () => void; drawerOpen: boolean }) {
  const { data: list } = useIncidents("open");
  const inc = pickTrackedIncident(list);

  // frame the affected building when an incident shows up (or a new one starts), then hand the camera back
  const framed = useRef<number | null>(null);
  const id = inc?.id ?? null;
  const building = inc?.building ?? null;
  useEffect(() => {
    if (id == null || building == null || framed.current === id) return;
    framed.current = id;
    if (useStageStore.getState().picked?.type === "building") return; // the drawer already frames a building
    useStageStore.getState().setShotOverride(incidentShot({ building }));
    const t = setTimeout(() => { if (useStageStore.getState().picked?.type !== "building") useStageStore.getState().setShotOverride(null); }, FRAME_MS);
    return () => clearTimeout(t);
  }, [id, building]);

  if (!inc && !policyNew) return null;
  const common = { "data-slot": "status-strip", "data-drawer-open": drawerOpen ? "true" : undefined } as const;

  if (!inc) {
    return (
      <div className="stage-strip" {...common}>
        <ToyCard className="flex h-full items-center gap-3 py-0 pl-5 pr-2.5" style={{ borderRadius: 999 }} label="Đang ở chính sách mới">
          <span className="toy-body whitespace-nowrap" style={{ color: "var(--ink)", fontWeight: 700 }}>Đang ở chính sách mới</span>
          <ToyButton size="sm" color="orange" onClick={onReset}>Chơi lại từ đầu?</ToyButton>
        </ToyCard>
      </div>
    );
  }

  const steps = stepViews(inc);
  return (
    <div className="stage-strip" {...common} data-incident={inc.id}>
      <ToyCard tone="red" className="flex h-full items-center gap-2.5 py-0 pl-4 pr-2" style={{ borderRadius: 999 }} label="Sự cố đang xử lý">
        <span className="shrink-0" style={{ color: "var(--red-ink)" }}><WarnIcon size={18} /></span>
        <span className="min-w-0 flex-1 truncate font-toy text-[16px] font-bold leading-none" style={{ color: "var(--ink)" }} title={`${inc.titleVi} · ${buildingName(inc.building)}`}>{inc.titleVi}</span>
        {policyNew ? <span className="hidden shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold min-[1500px]:inline" style={{ background: "var(--violet-soft)", color: "var(--violet-d)" }}>chính sách mới</span> : null}
        <ol className="m-0 flex shrink-0 list-none items-center gap-1 p-0" aria-label="Các bước xử lý sự cố">
          {steps.map((s) => (
            <li key={s.key} title={s.label} data-step={s.key} data-tone={s.tone} aria-current={s.tone === "active" ? "step" : undefined}
              className={`size-3 rounded-full ${s.tone === "active" ? "toy-live" : ""}`}
              style={{ background: s.tone === "done" ? "var(--teal)" : s.tone === "active" ? "var(--violet)" : s.tone === "skipped" ? "#e6dcc8" : "#fff", border: `2px solid ${s.tone === "pending" ? "#d9c49b" : s.tone === "skipped" ? "#cdbd9b" : "transparent"}` }} />
          ))}
        </ol>
        <span className="hidden shrink-0 rounded-full px-2.5 py-0.5 text-[12.5px] font-bold sm:inline" style={{ background: "#ffd9d2", color: "var(--red-d)" }} data-status={inc.status}>{INCIDENT_STATUS_VI[inc.status]}</span>
        <ToyButton size="sm" color="red" onClick={() => openBuilding(inc.building as BuildingCode, "incident")}>Xem</ToyButton>
      </ToyCard>
    </div>
  );
}
