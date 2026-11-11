import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "./queryKeys";
export const useCityStates = () => useQuery({ queryKey: qk.city, queryFn: api.getCityStates });
