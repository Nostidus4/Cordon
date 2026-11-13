// Pure helpers of the CITY_OPS views (docs/spec/CITY_OPS.md): faults per building, incident step view, action texts, camera/state derivation.
import type { BuildingCode, CameraShot } from "../stage/contract";
import { REASONS, type ReasonCode } from "../shared/reasonCodes";
import type { AgentRun, CityStates, FaultAction, FaultDef, Incident, IncidentStep } from "../types";

/** Faults that can be injected at a building (spec §3). */
export const faultsOfBuilding = (faults: FaultDef[], id: string): FaultDef[] => faults.filter((f) => f.building === id);

/** "0xabcdef…1234" */
export const shortHash = (h: string): string => (h.length > 14 ? `${h.slice(0, 8)}…${h.slice(-4)}` : h);

/** Contract errors / backend codes that are not in ReasonCode (the code is an open string on the wire). */
const EXTRA_REASON_VI: Record<string, string> = {
  CONFLICT_OF_INTEREST: "Xung đột lợi ích: chủ khu không được duyệt",
  NUMBERS_UNVERIFIED: "Có số liệu chưa kiểm chứng",
  INJECTION_IGNORED: "Agent bỏ qua văn bản lạ",
};
/** Vietnamese text for any reason code string; empty when none. */
export const reasonTextVi = (code: string | null | undefined): string => {
  if (!code) return "";
  return REASONS[code as ReasonCode]?.vi ?? EXTRA_REASON_VI[code] ?? "Bị chặn";
};

/** One line for the result of an injected fault action: how it ended. */
export function actionOutcomeVi(a: FaultAction): string {
  if (a.ok) return "Đã chạy xong";
  const r = reasonTextVi(a.reasonCode);
  return r ? `Bị chặn: ${r}` : "Bị chặn";
}

export type StepTone = "done" | "active" | "pending" | "skipped";
export interface StepView { key: IncidentStep["key"]; label: string; tone: StepTone; detail: string; txHash: string | null; index: number }
export const stepViews = (inc: Pick<Incident, "steps">): StepView[] =>
  inc.steps.map((s, index) => ({ key: s.key, label: s.labelVi, tone: s.status, detail: s.detailVi, txHash: s.txHash, index }));

/** The step to talk about: the active one, else the last done one. */
export const currentStep = (inc: Pick<Incident, "steps">): IncidentStep | null =>
  inc.steps.find((s) => s.status === "active") ?? [...inc.steps].reverse().find((s) => s.status === "done") ?? null;

export const isOpenIncident = (i: Pick<Incident, "status">) => i.status !== "resolved";
/** The incident the tracker shows: newest open one. */
export const pickTrackedIncident = (list: Incident[] | undefined): Incident | null => {
  const open = (list ?? []).filter(isOpenIncident);
  return open.length ? open.reduce((a, b) => (b.id > a.id ? b : a)) : null;
};
/** The Council can act right now. */
export const awaitsCouncil = (i: Incident | null): i is Incident & { proposalId: number } => !!i && i.status === "awaiting_council" && i.proposalId != null;

export const INCIDENT_STATUS_VI: Record<Incident["status"], string> = {
  detected: "Vừa phát hiện", contained: "Đã khoanh vùng", awaiting_council: "Chờ Hội đồng duyệt", recovering: "Đang hồi phục", resolved: "Đã xong",
};

/** Camera shot that frames the affected building of an incident. */
export const incidentShot = (i: Pick<Incident, "building">): CameraShot => ({ building: i.building as BuildingCode });

/** buildingStates prop of the city from GET /city/states. */
export function buildingStatesFrom(city: CityStates | undefined): Partial<Record<BuildingCode, "normal" | "warning" | "incident" | "recovery">> | undefined {
  if (!city) return undefined;
  return Object.fromEntries(city.buildings.map((b) => [b.id, b.state])) as Partial<Record<BuildingCode, "normal" | "warning" | "incident" | "recovery">>;
}

/** Latest agent run that carries a timeline (older backends omit `steps`). */
export const latestRunWithSteps = (runs: AgentRun[] | undefined): AgentRun | null => {
  for (let i = (runs?.length ?? 0) - 1; i >= 0; i--) if (runs![i].steps?.length) return runs![i];
  return null;
};
