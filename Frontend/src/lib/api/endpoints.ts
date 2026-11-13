// One typed function per endpoint of spec §8.6 (+ city states, scenario runs, demo/policy-v2, scene4 run/step7).
// VITE_API_MODE=mock (default): in-browser deterministic backend; live: fetch /api + SSE.
import { env } from "../../config/env";
import type {
  ActionResult, AgentRun, AskRequest, AssistantAnswer, AssistantLog, Attempt, ChainEvent, CityStates, CreateProposalRequest, DistrictDetail,
  DraftProposalRequest, Finding, GraphSnapshot, Health, LockRequest, MemberId, Org, PauseRequest, Proposal, ProposalDraft,
  ScenarioRun, SimResult, SimulateRequest, StreamListener,
  BuildingDetail, BuildingInfo, FaultDef, FaultResult, Incident,
  CopilotDraft, CopilotEval, CopilotReply,
} from "../../types";
import { connectSse } from "../sse";
import { http } from "./client";
import { mockApi } from "../mock/server";
import { mockCopilot } from "../mock/copilot";

export interface Api {
  getHealth(): Promise<Health>;
  getOrg(): Promise<Org>;
  getGraph(): Promise<GraphSnapshot>;
  simulate(req: SimulateRequest): Promise<SimResult>;
  getFindings(): Promise<Finding[]>;
  getDistrict(id: string): Promise<DistrictDetail>;
  getEvents(since?: string): Promise<ChainEvent[]>;
  getAttempts(run?: string): Promise<Attempt[]>;
  draftProposal(req: DraftProposalRequest): Promise<ProposalDraft>;
  createProposal(req: CreateProposalRequest): Promise<Proposal>;
  approveProposal(id: number, member: MemberId): Promise<Proposal>;
  getProposals(): Promise<Proposal[]>;
  lockDistrict(req: LockRequest): Promise<ActionResult>;
  pauseAll(req: PauseRequest): Promise<ActionResult>;
  askAssistant(req: AskRequest): Promise<AssistantAnswer>;
  runAgentOnce(): Promise<AgentRun>;
  runScene4(): Promise<ScenarioRun>;
  runScene4Step7(): Promise<Attempt>;
  applyPolicyV2(): Promise<ActionResult>;
  resetDemo(): Promise<ActionResult>;
  getCityStates(): Promise<CityStates>;
  getScenarioRuns(): Promise<ScenarioRun[]>;
  /** Read-only (system dashboard): agent_runs table, oldest first. */
  getAgentRuns(): Promise<AgentRun[]>;
  /** Read-only (system dashboard): assistant_logs table, oldest first. */
  getAssistantLogs(): Promise<AssistantLog[]>;
  /** CITY_OPS (docs/spec/CITY_OPS.md): the 8 buildings, one building, fault catalogue, inject a fault, incidents. */
  getBuildings(): Promise<BuildingInfo[]>;
  getBuilding(id: string): Promise<BuildingDetail>;
  getFaults(): Promise<FaultDef[]>;
  injectFault(id: string): Promise<FaultResult>;
  getIncidents(status?: "open" | "all"): Promise<Incident[]>;
  getIncident(id: number): Promise<Incident>;
  /** Copilot (B02, CITY-004; docs/spec/CITY_OPS.md §8): prepare-only chat, drafts, the single confirm path, latest eval. */
  askCopilot(message: string): Promise<CopilotReply>;
  getCopilotDrafts(): Promise<CopilotDraft[]>;
  confirmCopilotDraft(id: number, acknowledgeRisk: boolean): Promise<CopilotDraft>;
  rejectCopilotDraft(id: number): Promise<CopilotDraft>;
  getCopilotEval(): Promise<CopilotEval>;
  /** Stream subscription (SSE /api/stream in live mode, in-process bus in mock mode). Returns unsubscribe. */
  subscribe(listener: StreamListener): () => void;
}

const liveApi: Api = {
  getHealth: () => http("GET", "/health"),
  getOrg: () => http("GET", "/org"),
  getGraph: () => http("GET", "/graph"),
  simulate: (req) => http("POST", "/simulate", req),
  getFindings: () => http("GET", "/findings"),
  getDistrict: (id) => http("GET", `/districts/${encodeURIComponent(id)}`),
  getEvents: (since) => http("GET", `/events${since ? `?since=${encodeURIComponent(since)}` : ""}`),
  getAttempts: (run) => http("GET", `/attempts${run ? `?run=${encodeURIComponent(run)}` : ""}`),
  draftProposal: (req) => http("POST", "/proposals/draft", req),
  createProposal: (req) => http("POST", "/proposals", req),
  approveProposal: (id, member) => http("POST", `/proposals/${id}/approve`, { member }),
  getProposals: () => http("GET", "/proposals"),
  lockDistrict: (req) => http("POST", "/actions/lock", req),
  pauseAll: (req) => http("POST", "/actions/pause", req),
  askAssistant: (req) => http("POST", "/assistant/ask", req),
  runAgentOnce: () => http("POST", "/agent/run-once"),
  runScene4: () => http("POST", "/scenario/scene4/run"),
  runScene4Step7: () => http("POST", "/scenario/scene4/step7"),
  applyPolicyV2: () => http("POST", "/demo/policy-v2"),
  resetDemo: () => http("POST", "/demo/reset"),
  getCityStates: () => http("GET", "/city/states"),
  getScenarioRuns: () => http("GET", "/scenario/runs"),
  getAgentRuns: () => http("GET", "/agent/runs"),
  getAssistantLogs: () => http("GET", "/assistant/logs"),
  getBuildings: () => http("GET", "/city/buildings"),
  getBuilding: (id) => http("GET", `/city/buildings/${encodeURIComponent(id)}`),
  getFaults: () => http("GET", "/faults"),
  injectFault: (id) => http("POST", `/faults/${encodeURIComponent(id)}/inject`),
  getIncidents: (status = "all") => http("GET", `/incidents?status=${status}`),
  getIncident: (id) => http("GET", `/incidents/${id}`),
  askCopilot: (message) => http("POST", "/assistant/copilot", { message }),
  getCopilotDrafts: () => http("GET", "/assistant/copilot/drafts"),
  confirmCopilotDraft: (id, acknowledgeRisk) => http("POST", `/assistant/copilot/drafts/${id}/confirm`, { acknowledgeRisk }),
  rejectCopilotDraft: (id) => http("POST", `/assistant/copilot/drafts/${id}/reject`),
  getCopilotEval: () => http("GET", "/assistant/copilot/eval"),
  subscribe: (l) => connectSse(l),
};

export const api: Api = env.apiMode === "live" ? liveApi : ({ ...mockApi, ...mockCopilot } as Api);
