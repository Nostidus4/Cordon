import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "./queryKeys";
/** Attempts of a run (default: the current run). Live attempts are patched into the cache by StreamBridge. */
export const useAttempts = (run?: string | null) =>
  useQuery({ queryKey: qk.attempts(run), queryFn: () => api.getAttempts(run ?? undefined) });
