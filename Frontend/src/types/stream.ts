// SSE /api/stream message union (spec §8.6 + city_updated + reset).
import type { AgentRun } from "./agent";
import type { Attempt } from "./attempt";
import type { CityStates } from "./city";
import type { ProposalStatus } from "./common";
import type { ChainEvent } from "./event";

export type StreamMessage =
  | { type: "event"; data: ChainEvent }
  | { type: "attempt"; data: Attempt }
  | { type: "graph_updated"; data: { version: number; policyVersion: number; policyLabel?: number; block: number } }
  | { type: "proposal_updated"; data: { proposalId: number; status: ProposalStatus; approvals: number } }
  | { type: "agent_run"; data: AgentRun }
  | { type: "city_updated"; data: CityStates }
  | { type: "reset"; data: { at: string } };

export type StreamMessageType = StreamMessage["type"];
export const STREAM_TYPES: StreamMessageType[] = [
  "event", "attempt", "graph_updated", "proposal_updated", "agent_run", "city_updated", "reset",
];
export type StreamListener = (msg: StreamMessage) => void;
