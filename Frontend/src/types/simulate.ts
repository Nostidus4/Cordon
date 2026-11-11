// simulateCompromise contract (spec §8.4).
import type { EdgeSource, Money } from "./common";
import type { Finding } from "./finding";

/** Input-side change; raw values are integer base-unit strings. */
export type ProposedChange =
  | { kind: "consolidate"; into: string; keys: string[]; sharedCapRaw: string }
  | { kind: "raise_cap"; principalId: string; newCapRaw: string }
  | { kind: "move_key"; key: string; toPrincipal: string }
  | { kind: "council_district"; id: string; keys: string[]; capRaw: string };

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
