// AssistantAnswer (spec §9.3).
import type { ProposedChange } from "./simulate";

export interface AskRequest {
  question: string;
  context: { screen: "simulate" | "requests" | "map" | "incident"; principalIds?: string[]; proposalId?: number };
}

export interface AssistantAnswer {
  questionId: string; // e.g. "simulate.huy_too", "free_text"
  answer: string; // VI, <= 80 words
  numbersVerified: boolean;
  numbers: { label: string; value: string; source: "simulate" | "district" | "proposal" | "graph"; path: string }[];
  highlight: { nodeIds: string[]; edgeIds: string[] };
  suggestions?: { title: string; change: ProposedChange }[];
  warnings?: { code: "CONFLICT_OF_INTEREST" | "CONCENTRATION" | "DATA_DECLARED"; text: string }[];
}

/** Mock-only verifier shapes (lib/mock/assistantVerify); the backend verifies server-side and exposes only `numbersVerified`. */
export interface AssistantToolCall {
  tool: "get_graph" | "simulate_compromise" | "get_district" | "get_proposal" | "list_findings";
  args: Record<string, unknown>;
  resultSummary: string;
}
export interface AssistantNumberCheck {
  label: string;
  value: string;
  source: "simulate" | "district" | "proposal" | "graph";
  path: string;
  toolValue: string | null;
  match: boolean;
}

/** GET /api/assistant/logs (spec §8.2 assistant_logs, §9.4). Backend AssistantLogOut. */
export interface AssistantLog {
  id: number;
  ts: number; // epoch seconds
  questionId: string | null;
  question: string;
  answer: string; // VI text only
  /** Rule §9.4: every number in the answer is in numbers[] AND equals the tool value (checked by the backend). */
  numbersVerified: boolean;
  screen: AskRequest["context"]["screen"] | null;
  /** The question carried foreign text (prompt-injection) and was answered with the fixed template. */
  flaggedUntrusted: boolean;
}
