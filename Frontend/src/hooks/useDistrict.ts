import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "./queryKeys";
export const useDistrict = (id: string | null | undefined) =>
  useQuery({ queryKey: qk.district(id ?? ""), queryFn: () => api.getDistrict(id!), enabled: !!id });
