// AgentRun DTO (spec §7.1, §8.2 agent_runs). Backend AgentRunOut.
import type { Money } from "./common";
import type { ReasonCode } from "../shared/reasonCodes";
import type { AgentStep } from "./ops";

/** What the rule engine read (spec §7.1): `balances` of AgentRunOut (also `steps[0].detail`). */
export type AgentBalances = {
  vaultTusdc: Money;
  vaultTtkb: Money;
  ttkbValueInTusdc: Money;
  keyRemaining: Money;
  districtRemaining: Money | null;
};

export type AgentDecision = {
  tokenIn: string;
  tokenOut: string;
  amountIn: Money;
  /** shortfall = target tTKB value - current tTKB value (base units) */
  gap: Money;
  ttkbWeightBps: number;
  targetBps: number;
  totalValue: Money;
};

export interface AgentRun {
  id: number;
  ts: number; // epoch seconds
  /** swapped = sent and ok; reverted = sent and rejected; blocked = refused at simulate; no_action = nothing to do. */
  outcome: "swapped" | "reverted" | "blocked" | "no_action";
  decision: AgentDecision | null; // null when outcome is no_action
  reasonText: string | null; // VI sentence
  reasonSource: "llm" | "template" | null;
  reasonHash: string | null;
  txHash: string | null;
  reasonCode: ReasonCode | null;
  attemptId: number | null;
  balances: AgentBalances;
  /** CITY_OPS §2: read -> decide -> simulate -> send -> explain timeline. */
  steps: AgentStep[] | null;
  /** Foreign text fed to the agent (fault F06); the rule engine never reads it. */
  untrustedInput: string | null;
  injectionIgnored: boolean | null;
}
