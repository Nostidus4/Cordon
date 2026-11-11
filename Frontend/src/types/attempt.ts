// Attempt DTO (spec §8.2 attempts, §4.3).
import type { AttemptOutcome, Money } from "./common";
import type { ReasonCode } from "../shared/reasonCodes";

export interface AttemptAction {
  kind: "pay" | "swap" | "lock" | "approve";
  label: string; // VI description
  token?: string;
  to?: string;
  dex?: string;
  amount?: Money;
}

export interface Attempt {
  id: string;
  runId: string;
  step: number; // 0..7 (spec §4.3)
  ts: string; // ISO
  scenarioTime: string; // "14:02"
  signer: string; // key id or council member
  signerLabel: string;
  principalId: string | null;
  action: AttemptAction;
  outcome: AttemptOutcome;
  reasonCode: ReasonCode | null;
  txHash: string | null; // null for BLOCKED_AT_PROTOCOL
  simulated: boolean;
  errorRaw: string | null;
  keySpentAfter: Money | null;
  /** Only ever taken from the event, never summed on the client (spec §10.5). */
  principalSpentAfter: Money | null;
}
