// AgentRun DTO (spec §7.1, §8.2 agent_runs).
import type { Money } from "./common";
import type { ReasonCode } from "../shared/reasonCodes";
import type { AgentStep } from "./ops";

/** Inputs the rule engine used (spec §7.1). Additive/optional: a backend may omit it. */
export interface AgentRunInputs {
  vaultUsdc: Money;
  vaultTkb: Money;
  /** drift threshold in percentage points (spec: 5) */
  driftThreshold: number;
  /** shortfall = target tTKB value - current tTKB (base units) */
  shortfall: Money;
  /** per-run ceiling (spec: 5.000) */
  maxPerRun: Money;
  keyRemaining: Money;
  districtRemaining: Money;
}

export interface AgentRun {
  id: string;
  decision: {
    action: "swap" | "none";
    tokenIn: string;
    tokenOut: string;
    amountIn: Money | null;
    tTKBShareBefore: number; // percent
    targetShare: number;
  };
  reasonText: string; // VI sentence
  reasonSource: "llm" | "template";
  reasonHash: string | null;
  txHash: string | null;
  simulated: boolean;
  outcome: "ok" | "blocked" | "noop";
  reasonCode: ReasonCode | null;
  createdAt: string;
  inputs?: AgentRunInputs;
  /** CITY_OPS §2: read -> decide -> simulate -> send -> explain timeline (optional; older backends omit it). */
  steps?: AgentStep[];
  /** Foreign text fed to the agent (fault F06); the rule engine never reads it. */
  untrustedInput?: string | null;
  injectionIgnored?: boolean;
}
