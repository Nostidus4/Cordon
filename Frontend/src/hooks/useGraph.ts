import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "./queryKeys";
export const useGraph = () => useQuery({ queryKey: qk.graph, queryFn: api.getGraph });
