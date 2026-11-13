// B05 Tx Guardian (CITY-003): the list of checks and the three actions on it (check, send, reject).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { rejectCheck, sendCheck } from "../stage/txGuardLogic";
import type { PreparedTxInput } from "../types";
import { qk } from "./queryKeys";

export const useTxChecks = (limit = 20) =>
  useQuery({ queryKey: [...qk.txChecks, limit], queryFn: () => api.getTxChecks(limit), retry: false, refetchInterval: 5000 });

function useRefresh() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.txChecks });
    // a sent transaction can change a building colour, an attempt and the graph
    void qc.invalidateQueries({ queryKey: ["building"] });
    void qc.invalidateQueries({ queryKey: ["city"] });
  };
}

export function useCheckTx() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (tx: PreparedTxInput) => api.checkTx(tx), onSuccess: refresh });
}
export function useSendTx() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id: number) => sendCheck(api, id), onSuccess: refresh, onError: refresh });
}
export function useRejectTx() {
  const refresh = useRefresh();
  return useMutation({ mutationFn: (id: number) => rejectCheck(api, id), onSuccess: refresh, onError: refresh });
}
