// GET /api/districts/:id (spec §8.6), backend shape.
import type { KeyKind, Money } from "./common";
import type { Finding } from "./finding";

export interface DistrictKey {
  address: string;
  /** Seed id, e.g. `key_minh`. */
  seedId: string;
  kind: KeyKind;
  label: string;
  active: boolean;
  /** On the Tx AllowList. */
  allowListed: boolean;
  dailyCap: Money;
  spentToday: Money;
  remaining: Money;
}

export interface DistrictDetail {
  principalId: string;
  label: string;
  kind: KeyKind;
  dailyCap: Money | null;
  spentToday: Money;
  remaining: Money;
  youThink: Money;
  locked: boolean;
  keys: DistrictKey[];
  /** Declared (self-reported, unverified) relations touching this district */
  declaredEdges: { id: string; from: string; to: string; relation: "CONTROLS" | "ADMINS"; source: string; note: string }[];
  council: string[];
  findings: Finding[];
}
