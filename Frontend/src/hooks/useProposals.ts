import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "./queryKeys";
export const useProposals = () => useQuery({ queryKey: qk.proposals, queryFn: api.getProposals });
