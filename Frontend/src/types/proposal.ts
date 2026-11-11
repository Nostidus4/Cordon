// Proposal + RiskReport (spec §6.5, §8.5).
import type { MemberId, ProposalStatus } from "./common";
import type { Finding } from "./finding";
import type { ProposedChange, SimTotals } from "./simulate";

export interface Call {
  target: "PrincipalRegistry" | "PolicyVault";
  fn: string;
  args: Record<string, string>;
  /** Plain-words (VI) translation of the call (spec §10.4). */
  describe: string;
}

export interface RiskReport {
  before: SimTotals;
  after: SimTotals;
  findingsBefore: Finding[];
  findingsAfter: Finding[];
  conflictOfInterest: boolean;
  generatedAt: string;
  graphVersion: number;
}

export interface ProposalDraft {
  title: string;
  subjectPrincipal: string | null;
  change: ProposedChange;
  calls: Call[];
  describe: string[];
  riskReport: RiskReport;
  /** keccak256 of canonical JSON of riskReport (sorted keys, no spaces, generatedAt excluded), 0x-prefixed (spec §6.5). */
  riskReportHash: string;
  conflictedMembers: MemberId[];
  warnings: { code: "CONFLICT_OF_INTEREST" | "CONCENTRATION" | "DATA_DECLARED"; text: string }[];
}

export interface Proposal extends ProposalDraft {
  id: number;
  proposer: MemberId;
  approvals: { member: MemberId; at: string }[];
  threshold: number;
  status: ProposalStatus;
  createdAt: string;
  executedAt: string | null;
  resultingPolicyVersion: number | null;
}

export interface DraftProposalRequest {
  findingId?: string;
  change?: ProposedChange;
}
export interface CreateProposalRequest extends DraftProposalRequest {
  proposer: MemberId;
}
