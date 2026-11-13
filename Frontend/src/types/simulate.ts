// simulateCompromise contract (spec §8.4).
import type { EdgeSource, Money } from "./common";
import type { Finding } from "./finding";

/** Backend ProposedChange (camelCase). `keys` are key addresses; amounts are Money. */
export type ProposedChange =
  | { kind: "merge_district"; into: string; keys: string[]; districtCap: Money }
  | { kind: "set_district_cap"; principalId: string; cap: Money }
  | { kind: "set_key_cap"; key: string; cap: Money }
  | { kind: "move_key"; key: string; to: string }
  | { kind: "create_district"; principalId: string; label: string; owner: "council"; keys: string[]; districtCap: Money; protocolOnly?: boolean };

export interface SimulateRequest {
  compromised: string[];
  change?: ProposedChange;
}

export interface SimTotals {
  youThink: Money;
  enforced: Money;
  estimated: Money;
  vaultBalance: Money;
  percentOfMainTreasury: number; // of estimated, on 2.000.000
}

export interface SimResultCore {
  reachedKeys: { key: string; via: EdgeSource[] }[];
  perDistrict: { principalId: string; enforced: Money; estimated: Money; note: string }[];
  totals: SimTotals;
  highlights: { nodeIds: string[]; edgeIds: string[] };
  findings: Finding[];
}

/** With `change`: top-level = state after change; before/after = full results. */
export interface SimResult extends SimResultCore {
  before?: SimResultCore;
  after?: SimResultCore;
}
