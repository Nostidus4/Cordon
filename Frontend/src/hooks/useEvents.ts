import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { qk } from "./queryKeys";
export const useEvents = () => useQuery({ queryKey: qk.events, queryFn: () => api.getEvents() });
