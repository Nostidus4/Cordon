// CITY_OPS queries: building registry (live data preferred, static registry as fallback), building detail, fault catalogue, incidents, latest agent run.
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { BUILDING_REGISTRY, type BuildingInfo } from "../shared/buildings";
import { latestRunWithSteps } from "../lib/ops";
import { qk } from "./queryKeys";

/** GET /api/city/buildings when the backend has it, else the static registry (same shape). */
export function useBuildingInfos(): BuildingInfo[] {
  const q = useQuery({ queryKey: qk.buildings, queryFn: api.getBuildings, staleTime: 5 * 60_000, retry: false });
  return q.data && q.data.length ? q.data : BUILDING_REGISTRY;
}
export const useBuildingDetail = (id: string | null) =>
  useQuery({ queryKey: qk.building(id ?? ""), queryFn: () => api.getBuilding(id!), enabled: !!id, retry: false, refetchInterval: 8000 });
export const useFaults = (enabled: boolean) => useQuery({ queryKey: qk.faults, queryFn: api.getFaults, enabled, retry: false, staleTime: 5 * 60_000 });
export const useIncidents = (status: "open" | "all" = "open") =>
  useQuery({ queryKey: qk.incidents(status), queryFn: () => api.getIncidents(status), retry: false, refetchInterval: 10_000 });
export const useLatestAgentRun = (enabled: boolean) =>
  useQuery({ queryKey: qk.agentRuns, queryFn: api.getAgentRuns, enabled, retry: false, select: latestRunWithSteps });
