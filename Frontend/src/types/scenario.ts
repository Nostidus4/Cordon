// ScenarioRun DTO (spec §10.5 Replay; GET /api/scenario/runs is an addition to §8.6).
export interface ScenarioRun {
  id: string;
  name: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "completed" | "recorded";
  attemptCount: number;
}
