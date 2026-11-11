// Mutations for demo actions; errors surface as toasts. Queries refresh via stream invalidation (StreamBridge).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { toast } from "../store/uiStore";
import type { AskRequest, CreateProposalRequest, DraftProposalRequest, LockRequest, MemberId, PauseRequest } from "../types";

const onError = (e: unknown) => toast.error(e instanceof ApiError ? e.message : "Có lỗi xảy ra", e instanceof ApiError ? e.code : undefined);

export function useActions() {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries();
  return {
    lock: useMutation({ mutationFn: (r: LockRequest) => api.lockDistrict(r), onError, onSuccess: () => toast.warning("Đã khoá khu", "Các thẻ bị gạch khỏi chain.") }),
    pause: useMutation({ mutationFn: (r: PauseRequest) => api.pauseAll(r), onError, onSuccess: () => toast.warning("Đã dừng cả kho") }),
    approve: useMutation({ mutationFn: (v: { id: number; member: MemberId }) => api.approveProposal(v.id, v.member), onError, onSuccess: refresh }),
    draft: useMutation({ mutationFn: (r: DraftProposalRequest) => api.draftProposal(r), onError }),
    createProposal: useMutation({ mutationFn: (r: CreateProposalRequest) => api.createProposal(r), onError, onSuccess: refresh }),
    runAgent: useMutation({ mutationFn: () => api.runAgentOnce(), onError }),
    runScene4: useMutation({ mutationFn: () => api.runScene4(), onError }),
    step7: useMutation({ mutationFn: () => api.runScene4Step7(), onError }),
    policyV2: useMutation({ mutationFn: () => api.applyPolicyV2(), onError, onSuccess: refresh }),
    reset: useMutation({ mutationFn: () => api.resetDemo(), onError, onSuccess: () => { refresh(); toast.info("Đã đặt lại kịch bản", "Về đầu cảnh 1 · policy v1") } }),
  };
}
export const useAssistantAsk = () => useMutation({ mutationFn: (r: AskRequest) => api.askAssistant(r), onError });
