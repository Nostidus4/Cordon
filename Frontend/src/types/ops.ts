// CITY_OPS (docs/spec/CITY_OPS.md): building registry/detail, agent timeline, fault injection and incident responder. camelCase, additive.
import type { BuildingId, BuildingRule, RuleState } from "../shared/buildings";

export type { BuildingId, BuildingRule, RuleState };

/** GET /api/city/buildings (spec §2). Same shape as the static registry in `shared/buildings.ts`. */
export type { BuildingInfo } from "../shared/buildings";

export type BuildingRecentKind = "attempt" | "event" | "proposal" | "agent_run" | "assistant" | "incident";

export interface BuildingRecent {
  /** unix seconds (spec example `0`); a UI must not rely on it being ms. */
  ts: number;
  kind: BuildingRecentKind;
  summaryVi: string;
  txHash: string | null;
  simulated: boolean;
  reasonCode: string | null;
  /** e.g. "attempt:12" */
  ref: string;
}

export interface BuildingEvidence {
  /** "reasonCode" | "proposalId" | "findingId" | "building" | ... (open set) */
  kind: string;
  value: string | number;
}

export interface BuildingDetailRule extends BuildingRule {
  active: boolean;
}

/** GET /api/city/buildings/{id} (spec §2). */
export interface BuildingDetail {
  id: BuildingId;
  name: string;
  module: string;
  topic: string;
  summaryVi: string;
  state: RuleState;
  reasonVi: string;
  evidence: BuildingEvidence[];
  rules: BuildingDetailRule[];
  /** rule that decides the colour; null when normal */
  activeRuleId: string | null;
  /** at most 10, newest first */
  recent: BuildingRecent[];
  /** fault ids that can be injected at this building (spec §3) */
  faults: string[];
  /** open incident of this building, if any */
  incidentId: number | null;
}

/** One step of the B06 timeline (spec §2 "Dòng thời gian agent"). Added optionally to `AgentRun.steps`. */
export interface AgentStep {
  key: "read" | "decide" | "simulate" | "send" | "explain";
  labelVi: string;
  status: "ok" | "blocked" | "skipped";
  detail: Record<string, unknown>;
}

/** GET /api/faults (spec §3). */
export interface FaultDef {
  id: string;
  building: BuildingId;
  titleVi: string;
  /** what will really be done */
  whatVi: string;
  /** which rule is expected to stop it */
  expectVi: string;
}

export interface FaultAction {
  labelVi: string;
  ok: boolean;
  txHash: string | null;
  simulated: boolean;
  /** a ReasonCode, or a contract error name such as "CONFLICT_OF_INTEREST" (open set, hence string) */
  reasonCode: string | null;
}

/** POST /api/faults/{id}/inject (spec §3). */
export interface FaultResult {
  faultId: string;
  building: BuildingId;
  at: number;
  actions: FaultAction[];
  incidentId: number | null;
}

export type IncidentStatus = "detected" | "contained" | "awaiting_council" | "recovering" | "resolved";
export type IncidentStepKey = "detect" | "contain" | "propose" | "recover" | "verify";
export type IncidentStepStatus = "done" | "active" | "pending" | "skipped";

export interface IncidentStep {
  key: IncidentStepKey;
  labelVi: string;
  status: IncidentStepStatus;
  ts: number | null;
  detailVi: string;
  txHash: string | null;
}

/** `IncidentOut` of spec §4.4. */
export interface Incident {
  id: number;
  building: BuildingId;
  faultId: string | null;
  titleVi: string;
  status: IncidentStatus;
  openedAt: number;
  resolvedAt: number | null;
  subject: { principalId?: string | null; key?: string | null };
  trigger: { reasonCode?: string | null; attemptIds?: number[]; proposalId?: number | null; agentRunId?: number | null; assistantLogId?: number | null };
  steps: IncidentStep[];
  proposalId: number | null;
}
