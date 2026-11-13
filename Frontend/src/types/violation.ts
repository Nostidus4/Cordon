// Violations board (CITY-005, docs/spec/CITY_OPS.md §9): every call the vault refused. Mirrors Backend schemas/violation.py.

export type ViolationSource = "agent" | "attacker" | "fault" | "copilot" | "other";

export interface Violation {
  /** the attempt id */
  id: number;
  /** unix seconds */
  ts: number;
  source: ViolationSource;
  /** signer seed id */
  key: string;
  keyLabel: string;
  principalId: string | null;
  /** the district's display label */
  district: string | null;
  /** "pay" | "swap" | "raw" | ... */
  action: string;
  /** exactly what the chain returned (open string on the wire) */
  reasonCode: string;
  txHash: string | null;
  simulated: boolean;
  /** "attempt:<id>" */
  ref: string;
}
