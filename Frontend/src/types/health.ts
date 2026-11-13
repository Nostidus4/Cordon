// GET /api/health (API_CONTRACT §4, spec §8.6). Mirrors the backend HealthOut.
export interface Health {
  /** "ok" | "degraded" (open set on the backend). */
  status: string;
  chainMode: "sim" | "live";
  demoMode: boolean;
  /** True while txHashes are simulated (CHAIN_MODE=sim). */
  simulated: boolean;
  l1Block: number;
  cChainBlock: number | null;
  indexerLagBlocks: number;
  policyVersion: number;
  /** See `GraphSnapshot.policyLabel`. */
  policyLabel: number;
  graphVersion: number;
  /** `lastRunAt` is unix seconds. */
  agent: { status: "idle" | "running" | "error" | "never_run"; lastRunAt: number | null; lastOutcome?: string | null };
  /** Unix seconds when the L1 head was last seen to advance (null before the first /health read). */
  lastBlockAt: number | null;
  /** True when the L1 head has not advanced for 60 s (checked only in CHAIN_MODE=l1). */
  blockStalled: boolean;
  /** Warning codes: BLOCK_STALLED, INDEXER_LAG (>10 blocks), INDEXER_ERROR, SSE_SLOW (max event→SSE >3000 ms). */
  warnings?: string[];
  /** Event→SSE fan-out latency over the last 100 chain events, in ms. Spec requires < 3 s. */
  eventToSse?: { lastMs: number | null; maxMs: number | null; samples: number };
}
