// B05 Tx Guardian (docs/spec/CITY_OPS.md §7). Mirror of Backend schemas/txguard.py. Amounts are Money ({ raw, display }); convert to bigint at call sites.
import type { Money } from "./common";
import type { ReasonCode } from "../shared/reasonCodes";

export type TxKind = "pay" | "swap" | "approve" | "raw";
export type TxSource = "paste" | "city" | "copilot" | "attacker";
export type TxLevel = "safe" | "caution" | "danger";
export type TxCheckStatus = "pending" | "sent" | "rejected";

/** Input of POST /api/txguard/check. */
export interface PreparedTx {
  kind: TxKind;
  /** key address (hex); a seed id such as `key_minh` is accepted too */
  signer: string;
  token?: string | null;
  /** pay: recipient · approve: spender · swap: protocol · raw: target */
  to: string;
  /** base-unit integer as a decimal string */
  amount?: string | null;
  tokenOut?: string | null;
  minOut?: string | null;
  /** hex calldata, raw only */
  data?: string | null;
  memo: string;
  source: TxSource;
}

/** What a caller (the form, the Copilot) sends: `memo` and `source` default on the server. */
export type PreparedTxInput = Omit<PreparedTx, "memo" | "source"> & Partial<Pick<PreparedTx, "memo" | "source">>;

export interface TxFlow {
  token: string;
  amount: Money;
}

export interface TxApproval {
  token: string;
  spender: string;
  amount: Money;
  unlimited: boolean;
}

export interface StateDiff {
  outflows: TxFlow[];
  inflows: TxFlow[];
  approvals: TxApproval[];
  recipient: string;
  recipientLabel: string | null;
  recipientKnown: boolean;
  principalId: string | null;
  chainReason: ReasonCode | null;
  /** true when the chain's own simulation was consulted (pay/swap); approve/raw are read from the calldata only */
  simulated: boolean;
}

export type TxRuleId = "unlimited_approval" | "unknown_contract" | "address_poisoning" | "drain" | "abnormal_slippage";

export interface TxFinding {
  ruleId: string;
  level: "caution" | "danger";
  titleVi: string;
  detailVi: string;
}

export interface TxNumber {
  label: string;
  value: string;
}

export interface SentTx {
  txHash: string | null;
  simulated: boolean;
  ok: boolean;
  reasonCode: string | null;
}

export interface TxCheck {
  id: number;
  createdAt: number;
  prepared: PreparedTx;
  diff: StateDiff;
  findings: TxFinding[];
  level: TxLevel;
  explanationVi: string;
  explanationSource: "template" | "llm";
  numbers: TxNumber[];
  numbersVerified: boolean;
  status: TxCheckStatus;
  sentTx: SentTx | null;
}
