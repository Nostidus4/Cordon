import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { ProposedChange } from "../types";
import { qk } from "./queryKeys";
export const useSimulate = (compromised: string[], change?: ProposedChange, enabled = true) =>
  useQuery({ queryKey: qk.simulate(compromised, change), queryFn: () => api.simulate({ compromised, change }), enabled: enabled && compromised.length > 0, placeholderData: keepPreviousData });
