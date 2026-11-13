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
  /** Unix seconds when the L1 head was last seen to advance (null before the first /health read; the head is sampled on each /health call). API-004. */
  lastBlockAt?: number | null;
  /** True when the L1 head has not advanced for 60 s (checked only in CHAIN_MODE=l1). API-004. */
  blockStalled?: boolean;
  /** Warning codes: BLOCK_STALLED, INDEXER_LAG (>10 blocks), INDEXER_ERROR, SSE_SLOW (max event→SSE >3000 ms). API-004. */
  warnings?: string[];
  /** Event→SSE fan-out latency over the last 100 chain events, in ms. Spec requires < 3 s. API-004. */
  eventToSse?: { lastMs: number | null; maxMs: number | null; samples: number };
}
