// Proposal + RiskReport (spec §6.5, §8.5), backend shape.
import type { MemberId, ProposalStatus } from "./common";
import type { Finding } from "./finding";
import type { ProposedChange, SimTotals } from "./simulate";

/** Raw contract call as the backend returns it; the VI sentence for each lives in `descriptionVi`. */
export type Call = { target: string; fn: string; args: Record<string, unknown> };

export type RiskReport = {
  before: SimTotals;
  after: SimTotals;
  findingsBefore: Finding[];
  findingsAfter: Finding[];
  conflictOfInterest: boolean;
  generatedAt: string;
  graphVersion: number;
};

interface ProposalBody {
  title: string;
  findingId: string | null;
  subjectPrincipal: string | null;
  calls: Call[];
  /** Plain-words (VI) sentences for `calls` (spec §10.4). */
  descriptionVi: string[];
  riskReport: RiskReport;
  /** keccak256 of canonical JSON of riskReport (sorted keys, no spaces, generatedAt excluded), 0x-prefixed (spec §6.5). */
  riskReportHash: string;
  conflictedMembers: MemberId[];
  warnings: { code: "CONFLICT_OF_INTEREST" | "CONCENTRATION" | "DATA_DECLARED"; text: string }[];
}

export interface ProposalDraft extends ProposalBody {
  change: ProposedChange;
  /** tighten = one member suffices; loosen = 2/3 Council. */
  classification: "tighten" | "loosen";
  requiresCouncil: boolean;
  sent: boolean;
}

export interface ProposalMember {
  id: MemberId;
  label: string;
  principalId: string | null;
  approved: boolean;
  conflicted: boolean;
  canApprove: boolean;
  disabledReason: string | null;
}

export interface Proposal extends ProposalBody {
  id: number;
  change: ProposedChange | null;
  proposer: MemberId;
  /** Member ids that approved so far. */
  approvals: MemberId[];
  approvalCount: number;
  members: ProposalMember[];
  threshold: number;
  status: ProposalStatus;
  reportBasis: string;
  /** Unix seconds. */
  createdAt: number;
  executedAt: number | null;
  executedTxHash: string | null;
}

export interface DraftProposalRequest {
  findingId?: string;
  change?: ProposedChange;
  compromised?: string[];
}
export interface CreateProposalRequest {
  member: MemberId;
  findingId?: string;
  change?: ProposedChange;
  /** Optional; the backend derives it from the draft when absent. */
  title?: string;
}
