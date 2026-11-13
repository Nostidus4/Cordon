// Copilot (B02, CITY-004; docs/spec/CITY_OPS.md §8). Mirrors Backend/src/guardian/schemas/copilot.py. Money is { raw, display }.
import type { Money } from "./common";

export type CopilotIntent = "read" | "pay" | "swap" | "forecast_refused" | "injection_refused" | "unknown";
export type CopilotDraftStatus = "pending" | "confirmed" | "rejected" | "sent" | "blocked";
export type CopilotCheckLevel = "safe" | "caution" | "danger";

export interface CopilotRequest { message: string }
export interface CopilotConfirmRequest { acknowledgeRisk: boolean }

/** B05 `PreparedTx` field names. signer/token/to/tokenOut are hex addresses; amount/minOut raw integers as strings. */
export interface CopilotPreparedTx {
  kind: "pay" | "swap" | "approve" | "raw";
  signer: string;
  token: string;
  to: string;
  amount: string;
  tokenOut: string | null;
  minOut: string | null;
  data: string | null;
  memo: string;
  source: "paste" | "city" | "copilot" | "attacker";
}

export interface CopilotDraftDetails {
  signerLabel: string;
  toLabel: string;
  tokenSymbol: string;
  tokenOutSymbol: string | null;
  amount: Money;
  minOut: Money | null;
}

export interface CopilotDraftResult { txHash: string | null; simulated: boolean; ok: boolean; reasonCode: string | null }

export interface CopilotDraft {
  id: number;
  createdAt: number;
  intent: "pay" | "swap";
  prepared: CopilotPreparedTx;
  details: CopilotDraftDetails;
  summaryVi: string;
  status: CopilotDraftStatus;
  txCheckId: string | null;
  txCheckLevel: CopilotCheckLevel | null;
  result: CopilotDraftResult | null;
}

export interface CopilotNumber {
  label: string;
  value: string;
  source: "simulate" | "district" | "proposal" | "graph" | "draft";
  path: string;
}

export interface CopilotReply {
  intent: CopilotIntent;
  replyVi: string;
  numbers: CopilotNumber[];
  numbersVerified: boolean;
  draft: CopilotDraft | null;
  highlight: { nodeIds: string[]; edgeIds: string[] };
}

export interface CopilotEvalCase {
  id: string;
  message: string;
  expectedIntent: CopilotIntent;
  intent: CopilotIntent;
  intentOk: boolean;
  wrongTx: boolean;
  outcome: "answered" | "refused" | "sent" | "blocked_by_chain" | "blocked_by_checkpoint" | "unmatched";
  stoppedWrongTx: boolean;
  reasonCode: string | null;
  numbersVerified: boolean | null;
}
export interface CopilotEvalAccuracy { correct: number; total: number }
export interface CopilotEvalBlocked { blocked: number; total: number; byRefusal: number; byChain: number; byCheckpoint: number }
export interface CopilotEval {
  version: number;
  chainMode: string;
  total: number;
  intentAccuracy: CopilotEvalAccuracy;
  wrongTxBlocked: CopilotEvalBlocked;
  validSent: CopilotEvalAccuracy;
  readsVerified: CopilotEvalAccuracy;
  cases: CopilotEvalCase[];
}
