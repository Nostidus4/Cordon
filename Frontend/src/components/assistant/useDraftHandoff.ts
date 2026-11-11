// "Tạo đề xuất sửa": hands a DraftProposalRequest to the Requests screen, which calls api.draftProposal itself.
// Contract (agreed with the Requests agent): navigate("/requests", { state: { draft: { findingId } | { change } } }).
import { useNavigate } from "react-router-dom";
import type { DraftProposalRequest } from "../../types";

/** Shape of `location.state` on /requests when arriving from Map / Simulate / assistant. */
export interface RequestsHandoffState { draft: DraftProposalRequest }

export function useDraftHandoff(_source?: "map" | "simulate" | "assistant") {
  const navigate = useNavigate();
  return {
    pending: false,
    go: async (request: DraftProposalRequest) => {
      const state: RequestsHandoffState = { draft: request };
      navigate("/requests", { state });
    },
  };
}
