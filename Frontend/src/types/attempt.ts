// Attempt DTO (spec §8.2 attempts, §4.3). Backend AttemptOut; UI labels are derived (stage/logic `attemptLabel`).
import type { AttemptOutcome, Money } from "./common";
import type { ReasonCode } from "../shared/reasonCodes";

export type AttemptKind = "pay" | "swap" | "lock" | "approve" | "raw_call";

export interface Attempt {
  id: number;
  scenarioRunId: string | null;
  step: number | null; // 1..7 (spec §4.3)
  ts: number; // epoch seconds
  displayTime: string | null; // "14:02"
  signer: string; // key id or council member
  signerLabel: string;
  principalId: string | null;
  action: AttemptKind;
  outcome: AttemptOutcome;
  reasonCode: ReasonCode | null;
  reasonTextVi: string | null;
  reasonTextEn: string | null;
  txHash: string | null; // null for BLOCKED_AT_PROTOCOL
  simulated: boolean;
  errorRaw: string | null;
  block: number | null;
  token: string | null;
  to: string | null;
  toLabel: string | null;
  amount: Money | null;
  keySpentAfter: Money | null;
  /** Only ever taken from the event, never summed on the client (spec §10.5). */
  principalSpentAfter: Money | null;
  source: string; // "server" | "attacker_cli" | ...
  badge: string | null;
}
