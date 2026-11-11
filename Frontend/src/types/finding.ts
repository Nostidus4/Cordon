// Finding (spec §8.5).
import type { Severity } from "./common";
import type { ProposedChange } from "./simulate";

export type RuleId =
  | "R1_MULTI_KEY_NO_SHARED_CAP"
  | "R2_AGENT_NO_ALLOWLIST"
  | "R3_ADMIN_IS_OPERATOR"
  | "R4_COUNCIL_CONCENTRATION";

export interface Finding {
  id: string;
  ruleId: RuleId;
  severity: Severity;
  principalId: string;
  title: string; // VI
  detail: string; // VI
  createdAt: string;
  resolvedByProposal: number | null;
  /** Auto-generated fix (spec §8.5): feed to api.draftProposal({findingId}) or ({change}). */
  suggestedChange?: ProposedChange;
  data?: Record<string, unknown>;
}
