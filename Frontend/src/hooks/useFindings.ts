import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "./queryKeys";
export const useFindings = () => useQuery({ queryKey: qk.findings, queryFn: api.getFindings });
