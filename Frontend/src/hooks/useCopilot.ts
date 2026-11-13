// Copilot (B02, CITY-004): chat (prepare-only), drafts, the single confirm path, reject, latest eval.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { CopilotDraft, CopilotReply } from "../types";
import { qk } from "./queryKeys";

export interface ChatLine { role: "you" | "bot"; text: string; unverified?: boolean }

/** Confirm / reject for one draft card (the only way a draft is sent or dropped). */
export function useCopilotDraftActions() {
  const qc = useQueryClient();
  const refreshDrafts = () => qc.invalidateQueries({ queryKey: qk.copilotDrafts });
  const confirm = useMutation({
    mutationFn: (v: { id: number; acknowledgeRisk: boolean }) => api.confirmCopilotDraft(v.id, v.acknowledgeRisk),
    onSettled: () => {
      void refreshDrafts();
      for (const k of ["incidents", "building", "city", "attempts", "graph"]) void qc.invalidateQueries({ queryKey: [k] });
    },
  });
  const reject = useMutation({ mutationFn: (id: number) => api.rejectCopilotDraft(id), onSettled: () => void refreshDrafts() });
  return { confirm, reject };
}

export function useCopilot() {
  const qc = useQueryClient();
  const [lines, setLines] = useState<ChatLine[]>([]);
  const refreshDrafts = () => qc.invalidateQueries({ queryKey: qk.copilotDrafts });

  const drafts = useQuery({ queryKey: qk.copilotDrafts, queryFn: api.getCopilotDrafts, retry: false, refetchInterval: 8000 });
  const evalQ = useQuery({ queryKey: qk.copilotEval, queryFn: api.getCopilotEval, retry: false, staleTime: 60_000 });

  const ask = useMutation({
    mutationFn: (message: string) => api.askCopilot(message),
    onMutate: (message) => setLines((l) => [...l.slice(-5), { role: "you", text: message }]),
    onSuccess: (r: CopilotReply) => {
      setLines((l) => [...l.slice(-5), { role: "bot", text: r.replyVi, unverified: !r.numbersVerified }]);
      void refreshDrafts();
    },
    onError: (e) => setLines((l) => [...l.slice(-5), { role: "bot", text: e instanceof Error ? e.message : "Chưa gửi được câu hỏi." }]),
  });

  const list: CopilotDraft[] = drafts.data ?? [];
  return { lines, ask, drafts: list, evalReport: evalQ.data ?? null };
}
