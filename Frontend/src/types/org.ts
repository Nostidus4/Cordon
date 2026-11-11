// GET /api/org (spec §8.6).
import type { MemberId, Money } from "./common";

export interface CouncilMember {
  id: MemberId;
  label: string; // "Chị Trang"
  address: string;
  principalId: string | null; // district they own (conflict of interest)
}

export interface Org {
  company: { name: string; fictional: boolean };
  mainTreasury: { label: string; balance: Money; token: string };
  vault: { label: string; usdc: Money; tkb: Money };
  council: { members: CouncilMember[]; threshold: number };
}
