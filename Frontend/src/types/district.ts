// GET /api/districts/:id (spec §8.6).
import type { KeyKind, Money } from "./common";

export interface DistrictKey {
  key: string;
  address: string;
  kind: KeyKind;
  label: string;
  active: boolean; // on Tx AllowList
  dailyCap: Money;
  spentToday: Money;
}

export interface DistrictDetail {
  principalId: string;
  label: string;
  kind: KeyKind;
  dailyCap: Money | null;
  spentToday: Money;
  remaining: Money;
  locked: boolean;
  keys: DistrictKey[];
  /** Declared (self-reported, unverified) relations touching this district */
  declared: { from: string; to: string; relation: "CONTROLS" | "ADMINS"; note: string }[];
}
