// Payroll float (B04, CITY-006, docs/spec/PAYROLL.md section 8). Mirror of Backend schemas/payroll.py. Additive.
import type { Money } from "./common";
import type { AgentStep } from "./ops";

export type PayrollPhase = "accruing" | "unwinding" | "deadline" | "payday" | "paid";

export interface PayrollVenue {
  /** venue_a | venue_b | venue_<n> */
  id: string;
  addr: string;
  label: string;
  allowed: boolean;
  impaired: boolean;
  /** an unwind/recall on it failed */
  frozenHint: boolean;
  /** demo fault switch (mock venue) */
  frozen: boolean;
  deployed: Money;
  capAmount: Money;
  due: Money;
  assetsOf: Money;
  yieldBpsPerDay: number;
}

export interface PayrollRung {
  index: number;
  beforeDeadline: number;
  startsAt: number;
  maxDeployedBps: number;
  ceilingAmount: Money;
  active: boolean;
}

export interface PayrollPayee {
  account: string;
  label: string;
  amount: Money;
  paid: boolean;
}

export interface PayrollGuarantee {
  ok: boolean;
  coverage: Money;
  exposureAtRisk: Money;
  headroom: Money;
  reasonVi: string;
}

export interface PayrollState {
  now: number;
  cycleId: number;
  cycleStart: number;
  payday: number;
  deadline: number;
  phase: PayrollPhase;
  payrollTotal: Money;
  principal: Money;
  reserve: Money;
  idle: Money;
  deployedTotal: Money;
  yieldRealized: Money;
  bufferAmount: Money;
  ceilingAmount: Money;
  nextRungAt: number;
  killed: boolean;
  /** 0 none, 1 member, 2 deadline, 3 automation */
  killReason: number;
  killReasonVi: string | null;
  coverage: Money;
  exposureAtRisk: Money;
  coverageOk: boolean;
  faultTolerance: number;
  bufferBps: number;
  dayUnit: number;
  timeScale: number;
  executed: boolean;
  venues: PayrollVenue[];
  rungs: PayrollRung[];
  roster: PayrollPayee[];
  agents: string[];
  guarantee: PayrollGuarantee;
  vaultCoversPayroll: boolean;
}

export interface PayrollLadderPoint {
  ts: number;
  ceilingAmount: Money;
}

export interface PayrollLadder {
  now: number;
  cycleStart: number;
  deadline: number;
  payday: number;
  currentIndex: number;
  rungs: PayrollRung[];
  curve: PayrollLadderPoint[];
}

export interface PayrollEvent {
  name: string;
  block: number;
  txHash: string;
  logIndex: number;
  ts: number;
  payload: Record<string, unknown>;
  simulated: boolean;
}

export interface PayrollAgentRun {
  id: number;
  ts: number;
  /** no_action | acted | blocked | kill_requested */
  outcome: string;
  actions: Record<string, unknown>[];
  steps: AgentStep[];
  reasonText: string;
  /** llm | template */
  reasonSource: string;
  reasonHash: string;
  untrustedInput: string | null;
  injectionIgnored: boolean | null;
  facts: Record<string, unknown>;
}

export interface PayrollReport {
  ts: number;
  text: string;
  reasonSource: string;
  reasonHash: string;
  facts: Record<string, unknown>;
}

export interface PayrollTx {
  ok: boolean;
  status: string;
  reasonCode: string | null;
  reasonVi: string | null;
  errorRaw: string | null;
  txHash: string | null;
  proposalId: number | null;
  events: string[];
}

export interface PayrollCall {
  target: string;
  fn: string;
  args: Record<string, unknown>;
}

export interface PayrollProposal {
  id: number;
  title: string;
  proposer: string;
  calls: PayrollCall[];
  descriptionVi: string[];
  riskReportHash: string;
  approvals: number;
  approvedBy: string[];
  threshold: number;
  status: "open" | "executed" | "cancelled";
  createdAt: number;
}

export interface PayrollAdvanceRequest {
  seconds: number;
}
export interface PayrollScaleRequest {
  scale: number;
}
export interface PayrollMemberRequest {
  member: string;
}
export interface PayrollProposeRequest {
  member: string;
  title: string;
  calls: PayrollCall[];
  riskReportHash: string;
}
export interface PayrollAgentRunRequest {
  untrustedInput?: string | null;
}
