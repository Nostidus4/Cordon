import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "./queryKeys";
export const useOrg = () => useQuery({ queryKey: qk.org, queryFn: api.getOrg });
