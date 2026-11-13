// API-002 (#6): backend OpenAPI (generated/openapi.d.ts) <-> hand-written FE types in ./index.
// Enforced by `npm run typecheck` (tsc); `vitest run` does not type-check, so the `it` at the bottom is a placeholder.
//
// Per pair, Diff lists top-level keys: onlyBE (FE lacks it), onlyFE (client-only/mock-only/renamed), differ (both have it,
// but optionality or type differs). `Known` is the drift accepted TODAY and must match EXACTLY: new drift fails, and
// fixing drift also fails until its entry is deleted here (ratchet). Target state is every Known<> empty; the drift is
// tracked in the PR description (mismatch table) and docs/spec/API_CONTRACT.md §7 (QA-001/WEB-001).
//
// Deliberate representation rules (not drift):
//  - Money: both sides are { raw: string; display: string } (bigint conversion happens at call sites), no mapping needed.
//  - Pydantic `T | None = None` is emitted as `x?: T | null`, but FastAPI serialises defaults, so the key is always present:
//    for RESPONSES such keys are read as required `x: T | null` (Norm). Exception: POST /simulate uses
//    response_model_exclude_none, but it is still compared via Norm (listed under SimulateResponse drift).
//    REQUESTS are compared as generated (optional stays optional).
//  - Backend plain `str` where FE has a literal union (member ids, reason codes, enums): FE narrower is accepted
//    ([FE] extends [BE]); BE narrower than FE is drift. Optionality must match exactly.
//  - Comparison is shallow on keys, assignability on values: extra FE-only fields nested inside a value are not detected.
//  - SSE: `event`/`attempt`/`proposal_updated`/`agent_run`/`city_updated`/`incident_updated` carry the REST models
//    (EventOut, AttemptOut, ProposalOut, AgentRunOut, CityStates, IncidentOut), covered below via the REST pairs.
//    `graph_updated` and `reset` have no OpenAPI schema (SSE is untyped in OpenAPI), so they cannot be compared here.
//    STREAM_TYPES is checked against the contract list at the bottom.
import { expectTypeOf } from "vitest";
import type { components } from "./generated/openapi";
import type * as T from "./index";
type S = components["schemas"];
type Opt<O, K extends keyof O> = {} extends Pick<O, K> ? true : false;
type NullOpt<B> = { [K in keyof B]-?: undefined extends B[K] ? (null extends B[K] ? K : never) : never }[keyof B];
type Norm<B> = { [K in keyof B as K extends NullOpt<B> ? never : K]: B[K] } & { [K in NullOpt<B>]-?: Exclude<B[K], undefined> };
type Sim<T> = { [K in keyof T]: T[K] };
type DiffN<B, F> = {
  onlyBE: Exclude<keyof B, keyof F>;
  onlyFE: Exclude<keyof F, keyof B>;
  differ: { [K in keyof B & keyof F]: Opt<B, K> extends Opt<F, K> ? (Opt<F, K> extends Opt<B, K> ? ([Exclude<F[K], undefined>] extends [Exclude<B[K], undefined>] ? never : K) : K) : K }[keyof B & keyof F];
};
type DiffR<B, F> = DiffN<Sim<Norm<B>>, F>;
type DiffQ<B, F> = DiffN<B, F>;

type Known<O = never, F = never, D = never> = { onlyBE: O; onlyFE: F; differ: D };
// Money <-> Money
expectTypeOf<DiffR<S["Money"], T.Money>>().toEqualTypeOf<Known<never, never, never>>();
// HealthOut <-> Health
expectTypeOf<DiffR<S["HealthOut"], T.Health>>().toEqualTypeOf<Known<"cChainBlock" | "graphVersion" | "indexerLagBlocks" | "l1Block" | "simulated" | "status", "ok" | "l1" | "cchain" | "indexerLagMs" | "uptimeSec", "agent" | "blockStalled" | "lastBlockAt" | "policyLabel">>();
// OrgOut <-> Org
expectTypeOf<DiffR<S["OrgOut"], T.Org>>().toEqualTypeOf<Known<"policyLabel" | "policyVersion" | "fictional" | "id" | "name" | "threshold", "company", "council">>();
// GraphSnapshot <-> GraphSnapshot
expectTypeOf<DiffR<S["GraphSnapshot"], T.GraphSnapshot>>().toEqualTypeOf<Known<never, never, "policyLabel">>();
// GraphNode <-> GraphNode
expectTypeOf<DiffR<S["GraphNode"], T.GraphNode>>().toEqualTypeOf<Known<never, never, never>>();
// GraphEdge <-> GraphEdge
expectTypeOf<DiffR<S["GraphEdge"], T.GraphEdge>>().toEqualTypeOf<Known<never, "note", never>>();
// GraphDistrict <-> District
expectTypeOf<DiffR<S["GraphDistrict"], T.District>>().toEqualTypeOf<Known<never, never, never>>();
// FindingOut <-> Finding
expectTypeOf<DiffR<S["FindingOut"], T.Finding>>().toEqualTypeOf<Known<"proposal", "detail" | "createdAt" | "resolvedByProposal" | "suggestedChange", "data">>();
// SimulateResponse <-> SimResult
expectTypeOf<DiffR<S["SimulateResponse"], T.SimResult>>().toEqualTypeOf<Known<never, never, "after" | "before" | "findings">>();
// Totals <-> SimTotals
expectTypeOf<DiffR<S["Totals"], T.SimTotals>>().toEqualTypeOf<Known<never, never, never>>();
// DistrictOut <-> DistrictDetail
expectTypeOf<DiffR<S["DistrictOut"], T.DistrictDetail>>().toEqualTypeOf<Known<"council" | "findings" | "youThink" | "declaredEdges", "declared", "keys">>();
// DistrictKey <-> DistrictKey
expectTypeOf<DiffR<S["DistrictKey"], T.DistrictKey>>().toEqualTypeOf<Known<"remaining" | "allowListed" | "seedId", "key", never>>();
// EventOut <-> ChainEvent
expectTypeOf<DiffR<S["EventOut"], T.ChainEvent>>().toEqualTypeOf<Known<never, "id" | "chain", "ts">>();
// AttemptOut <-> Attempt
expectTypeOf<DiffR<S["AttemptOut"], T.Attempt>>().toEqualTypeOf<Known<"token" | "block" | "source" | "to" | "amount" | "badge" | "displayTime" | "reasonTextEn" | "reasonTextVi" | "scenarioRunId" | "toLabel", "runId" | "scenarioTime", "id" | "ts" | "action">>();
// DraftOut <-> ProposalDraft
expectTypeOf<DiffR<S["DraftOut"], T.ProposalDraft>>().toEqualTypeOf<Known<"classification" | "descriptionVi" | "findingId" | "requiresCouncil" | "sent", "describe", "calls" | "riskReport">>();
// ProposalOut <-> Proposal
expectTypeOf<DiffR<S["ProposalOut"], T.Proposal>>().toEqualTypeOf<Known<"descriptionVi" | "findingId" | "approvalCount" | "executedTxHash" | "members" | "reportBasis", "describe" | "resultingPolicyVersion", "createdAt" | "calls" | "riskReport" | "approvals" | "executedAt">>();
// ActionOut <-> ActionResult
expectTypeOf<DiffR<S["ActionOut"], T.ActionResult>>().toEqualTypeOf<Known<"status" | "block" | "principalId" | "member", "policyVersion" | "ok", never>>();
// AssistantAnswer <-> AssistantAnswer
expectTypeOf<DiffR<S["AssistantAnswer"], T.AssistantAnswer>>().toEqualTypeOf<Known<"numbersVerified" | "questionId", never, never>>();
// AssistantLogOut <-> AssistantLog
expectTypeOf<DiffR<S["AssistantLogOut"], T.AssistantLog>>().toEqualTypeOf<Known<"ts" | "flaggedUntrusted" | "questionId" | "screen", "createdAt" | "toolCalls" | "checks" | "uncovered", "id" | "answer">>();
// AgentRunOut <-> AgentRun
expectTypeOf<DiffR<S["AgentRunOut"], T.AgentRun>>().toEqualTypeOf<Known<"ts" | "attemptId" | "balances", "simulated" | "createdAt" | "inputs", "id" | "injectionIgnored" | "steps" | "untrustedInput">>();
// ScenarioRunOut <-> ScenarioRun
expectTypeOf<DiffR<S["ScenarioRunOut"], T.ScenarioRun>>().toEqualTypeOf<Known<"policyVersion" | "attempts" | "delay" | "error", "name" | "attemptCount", "finishedAt" | "startedAt">>();
// CityStates <-> CityStates
expectTypeOf<DiffR<S["CityStates"], T.CityStates>>().toEqualTypeOf<Known<"graphVersion" | "policyLabel" | "policyVersion" | "buildings" | "updatedAt", "B01" | "B02" | "B03" | "B04" | "B05" | "B06" | "B07" | "B08", never>>();
// Building <-> CityBuildingStatus
expectTypeOf<DiffR<S["Building"], T.CityBuildingStatus>>().toEqualTypeOf<Known<"id" | "name", never, "evidence">>();
// BuildingInfo <-> BuildingInfo
expectTypeOf<DiffR<S["BuildingInfo"], T.BuildingInfo>>().toEqualTypeOf<Known<never, never, never>>();
// BuildingDetail <-> BuildingDetail
expectTypeOf<DiffR<S["BuildingDetail"], T.BuildingDetail>>().toEqualTypeOf<Known<never, never, "recent">>();
// RecentItem <-> BuildingRecent
expectTypeOf<DiffR<S["RecentItem"], T.BuildingRecent>>().toEqualTypeOf<Known<never, never, "ref">>();
// Evidence <-> BuildingEvidence
expectTypeOf<DiffR<S["Evidence"], T.BuildingEvidence>>().toEqualTypeOf<Known<never, "simulated" | "txHash", never>>();
// RuleStatus <-> BuildingDetailRule
expectTypeOf<DiffR<S["RuleStatus"], T.BuildingDetailRule>>().toEqualTypeOf<Known<never, never, never>>();
// FaultDef <-> FaultDef
expectTypeOf<DiffR<S["FaultDef"], T.FaultDef>>().toEqualTypeOf<Known<never, never, never>>();
// FaultResult <-> FaultResult
expectTypeOf<DiffR<S["FaultResult"], T.FaultResult>>().toEqualTypeOf<Known<never, never, "at">>();
// FaultAction <-> FaultAction
expectTypeOf<DiffR<S["FaultAction"], T.FaultAction>>().toEqualTypeOf<Known<never, never, never>>();
// IncidentOut <-> Incident
expectTypeOf<DiffR<S["IncidentOut"], T.Incident>>().toEqualTypeOf<Known<never, never, "trigger">>();
// IncidentStep <-> IncidentStep
expectTypeOf<DiffR<S["IncidentStep"], T.IncidentStep>>().toEqualTypeOf<Known<never, never, never>>();
// AgentStep <-> AgentStep
expectTypeOf<DiffR<S["AgentStep"], T.AgentStep>>().toEqualTypeOf<Known<never, never, never>>();
// CouncilMemberOut <-> CouncilMember
expectTypeOf<DiffR<S["CouncilMemberOut"], T.CouncilMember>>().toEqualTypeOf<Known<never, never, never>>();
// LockRequest <-> LockRequest
expectTypeOf<DiffQ<S["LockRequest"], T.LockRequest>>().toEqualTypeOf<Known<never, never, never>>();
// PauseRequest <-> PauseRequest
expectTypeOf<DiffQ<S["PauseRequest"], T.PauseRequest>>().toEqualTypeOf<Known<never, never, never>>();
// ApproveRequest <-> ApproveRequest
expectTypeOf<DiffQ<S["ApproveRequest"], T.ApproveRequest>>().toEqualTypeOf<Known<never, never, never>>();
// AskRequest <-> AskRequest
expectTypeOf<DiffQ<S["AskRequest"], T.AskRequest>>().toEqualTypeOf<Known<never, never, "context">>();
// SimulateRequest <-> SimulateRequest
expectTypeOf<DiffQ<S["SimulateRequest"], T.SimulateRequest>>().toEqualTypeOf<Known<never, never, never>>();
// DraftRequest <-> DraftProposalRequest
expectTypeOf<DiffQ<S["DraftRequest"], T.DraftProposalRequest>>().toEqualTypeOf<Known<"compromised", never, never>>();
// ProposeRequest <-> CreateProposalRequest
expectTypeOf<DiffQ<S["ProposeRequest"], T.CreateProposalRequest>>().toEqualTypeOf<Known<"title" | "member", "proposer", never>>();
// B05 Tx Guardian (CITY-003)
// TxCheckOut <-> TxCheck
expectTypeOf<DiffR<S["TxCheckOut"], T.TxCheck>>().toEqualTypeOf<Known<never, never, never>>();
// PreparedTx <-> PreparedTx
expectTypeOf<DiffQ<S["PreparedTx"], T.PreparedTx>>().toEqualTypeOf<Known<never, never, never>>();
// StateDiff <-> StateDiff
expectTypeOf<DiffR<S["StateDiff"], T.StateDiff>>().toEqualTypeOf<Known<never, never, never>>();
// TxFlow <-> TxFlow
expectTypeOf<DiffR<S["TxFlow"], T.TxFlow>>().toEqualTypeOf<Known<never, never, never>>();
// TxApproval <-> TxApproval
expectTypeOf<DiffR<S["TxApproval"], T.TxApproval>>().toEqualTypeOf<Known<never, never, never>>();
// TxFinding <-> TxFinding
expectTypeOf<DiffR<S["TxFinding"], T.TxFinding>>().toEqualTypeOf<Known<never, never, never>>();
// TxNumber <-> TxNumber
expectTypeOf<DiffR<S["TxNumber"], T.TxNumber>>().toEqualTypeOf<Known<never, never, never>>();
// SentTx <-> SentTx
expectTypeOf<DiffR<S["SentTx"], T.SentTx>>().toEqualTypeOf<Known<never, never, never>>();

// SSE type list must match Backend schemas/stream.py SSE_EVENT_TYPES (API_CONTRACT §5).
expectTypeOf<T.StreamMessageType>().toEqualTypeOf<
  "event" | "attempt" | "graph_updated" | "proposal_updated" | "agent_run" | "city_updated" | "incident_updated" | "reset"
>();

it("parity is enforced by tsc (npm run typecheck)", () => {
  expect(true).toBe(true);
});
