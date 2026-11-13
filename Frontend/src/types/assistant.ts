// AssistantAnswer (spec §9.3).
import type { ProposedChange } from "./simulate";

export interface AskRequest {
  question: string;
  context?: { screen: "simulate" | "requests" | "map" | "incident"; principalIds?: string[]; proposalId?: number };
}

export interface AssistantAnswer {
  answer: string; // VI, <= 80 words
  numbers: { label: string; value: string; source: "simulate" | "district" | "proposal" | "graph"; path: string }[];
  highlight: { nodeIds: string[]; edgeIds: string[] };
  suggestions?: { title: string; change: ProposedChange }[];
  warnings?: { code: "CONFLICT_OF_INTEREST" | "CONCENTRATION" | "DATA_DECLARED"; text: string }[];
}

/** GET /api/assistant/logs (spec §8.2 assistant_logs, §9.4). Additive read-only. */
export interface AssistantToolCall {
  tool: "get_graph" | "simulate_compromise" | "get_district" | "get_proposal" | "list_findings";
  args: Record<string, unknown>;
  /** One-line summary of what the tool returned (not the full payload). */
  resultSummary: string;
}
export interface AssistantNumberCheck {
  label: string;
  value: string;
  source: "simulate" | "district" | "proposal" | "graph";
  path: string;
  /** What the tool actually returned at `path` (null if the path could not be resolved). */
  toolValue: string | null;
  match: boolean;
}
export interface AssistantLog {
  id: string;
  question: string;
  toolCalls: AssistantToolCall[];
  answer: AssistantAnswer;
  /** Rule §9.4: every number in `answer` appears in numbers[] AND each numbers[].value equals the tool value. */
  checks: AssistantNumberCheck[];
  /** Numbers found in the answer text that are not covered by numbers[] (must be empty). */
  uncovered: string[];
  numbersVerified: boolean;
  createdAt: string;
}
