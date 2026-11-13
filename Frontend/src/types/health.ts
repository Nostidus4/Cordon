// GET /api/health (spec §8.6).
export interface Health {
  ok: boolean;
  l1: { block: number; latestBlockAt: string };
  cchain: { block: number };
  indexerLagMs: number;
  agent: { status: "idle" | "running" | "error"; lastRunAt: string | null };
  demoMode: boolean;
  chainMode: "sim" | "live";
  policyVersion: number;
  /** See `GraphSnapshot.policyLabel`. */
  policyLabel?: number;
  /** Seconds since the backend process started (additive; optional so older backends still type-check). */
  uptimeSec?: number;
}
