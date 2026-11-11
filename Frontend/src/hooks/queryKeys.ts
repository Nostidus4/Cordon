export const qk = {
  health: ["health"] as const,
  org: ["org"] as const,
  graph: ["graph"] as const,
  findings: ["findings"] as const,
  district: (id: string) => ["district", id] as const,
  events: ["events"] as const,
  attempts: (run?: string | null) => ["attempts", run ?? "current"] as const,
  proposals: ["proposals"] as const,
  simulate: (ids: string[], change?: unknown) => ["simulate", [...ids].sort().join(","), change ?? null] as const,
  city: ["city"] as const,
  runs: ["runs"] as const,
};
