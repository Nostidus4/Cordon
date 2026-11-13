// GET /api/org (spec §8.6).
import type { MemberId, Money } from "./common";

export interface CouncilMember {
  id: MemberId;
  label: string; // "Chị Trang"
  address: string;
  principalId: string | null; // district they own (conflict of interest)
}

export interface Org {
  id: string;
  name: string;
  fictional: boolean;
  mainTreasury: { label: string; balance: Money };
  /** `tkb` is not sent by the backend yet (only `balance` = tUSDC); the mock fills it, the UI shows it when present. */
  vault: { label: string; address?: string; balance: Money; paused?: boolean; tkb?: Money };
  council: CouncilMember[];
  threshold: number;
  policyVersion: number;
  /** See `GraphSnapshot.policyLabel`. */
  policyLabel: number;
}
