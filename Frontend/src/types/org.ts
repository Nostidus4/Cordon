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
  vault: { label: string; address: string; balance: Money; balanceTkb: Money; paused: boolean };
  council: CouncilMember[];
  threshold: number;
  policyVersion: number;
  /** See `GraphSnapshot.policyLabel`. */
  policyLabel: number;
}
