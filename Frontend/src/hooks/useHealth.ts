import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "./queryKeys";
export const useHealth = () => useQuery({ queryKey: qk.health, queryFn: api.getHealth, refetchInterval: 4000 });
