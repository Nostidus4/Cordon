// Shared primitives of the API contract (spec §8.6). Mirror of Backend schemas/common.py + shared/enums.py.

/** Money on the wire: raw = integer string in base units (tUSDC 6 decimals), display = "30.000". */
export interface Money {
  raw: string;
  display: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export type KeyKind = "HUMAN" | "AGENT" | "SERVICE";
export type NodeType =
  | "Treasury" | "Vault" | "Council" | "Member" | "Principal" | "Key" | "Recipient" | "Protocol" | "Token";
export type EdgeType = "HOLDS_KEY" | "CONTROLS" | "ADMINS" | "MAY_PAY" | "MAY_CALL" | "FUNDS" | "APPROVES";
export type EdgeSource = "onchain" | "declared" | "inferred";
export type AttemptOutcome = "ok" | "reverted" | "blocked_at_protocol";
export type ProposalStatus = "open" | "executed" | "cancelled";
export type Severity = "HIGH" | "MEDIUM" | "LOW";
/** Council member ids (spec §4.2). */
export type MemberId = "trang" | "lan" | "huy";
