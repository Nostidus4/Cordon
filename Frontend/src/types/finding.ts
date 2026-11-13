// Finding (spec §8.5), backend shape. UI text beyond `title` is derived from `data` (see lib/findingText.ts).
import type { Severity } from "./common";
import type { ProposedChange } from "./simulate";

export type RuleId =
  | "R1_MULTI_KEY_NO_SHARED_CAP"
  | "R2_AGENT_NO_ALLOWLIST"
  | "R3_ADMIN_IS_OPERATOR"
  | "R4_COUNCIL_CONCENTRATION";

export interface Finding {
  /** `<ruleId>:<subject>`, e.g. `R1_MULTI_KEY_NO_SHARED_CAP:minh`. */
  id: string;
  ruleId: RuleId;
  severity: Severity;
  principalId: string;
  title: string; // VI
  /** Rule facts (R1: keys, districts, maxKeyDailyCap, suggestedDistrictCap, ...). */
  data: Record<string, unknown>;
  /** Auto-generated fix (spec §8.5): feed to api.draftProposal({findingId}) or ({change}). */
  proposal: ProposedChange | null;
}
