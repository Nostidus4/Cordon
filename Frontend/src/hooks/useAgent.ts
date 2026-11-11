import { useActions } from "./useActions";
/** Agent Cân đối: POST /api/agent/run-once */
export const useAgent = () => useActions().runAgent;
