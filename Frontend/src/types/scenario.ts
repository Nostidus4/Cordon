// ScenarioRun DTO (spec §10.5 Replay; GET /api/scenario/runs is an addition to §8.6). Backend ScenarioRunOut.
import type { Attempt } from "./attempt";

export interface ScenarioRun {
  id: string;
  status: "running" | "waiting_lock" | "completed" | "failed" | "recorded";
  delay: number;
  startedAt: number; // epoch seconds
  finishedAt: number | null;
  policyVersion: number;
  error: string | null;
  attempts: Attempt[];
}
