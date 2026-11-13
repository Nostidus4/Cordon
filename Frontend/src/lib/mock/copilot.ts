// Copilot in mock mode (CITY-004): there is no chain here to prepare against, so the mock answers honestly instead of
// faking a draft. The live backend does the real work (docs/spec/CITY_OPS.md §8).
import type { CopilotDraft, CopilotEval, CopilotReply } from "../../types";
import { ApiError } from "./server";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const mockCopilot = {
  async askCopilot(_message: string): Promise<CopilotReply> {
    await sleep(120);
    return {
      intent: "unknown", replyVi: "Trợ lý chi tiền chỉ chạy khi nối máy chủ thật (VITE_API_MODE=live).", numbers: [], numbersVerified: true, draft: null,
      highlight: { nodeIds: [], edgeIds: [] },
    };
  },
  async getCopilotDrafts(): Promise<CopilotDraft[]> { return []; },
  async confirmCopilotDraft(_id: number, _acknowledgeRisk: boolean): Promise<CopilotDraft> {
    throw new ApiError("DRAFT_NOT_FOUND", "Không có lệnh nháp này.", 404);
  },
  async rejectCopilotDraft(_id: number): Promise<CopilotDraft> {
    throw new ApiError("DRAFT_NOT_FOUND", "Không có lệnh nháp này.", 404);
  },
  async getCopilotEval(): Promise<CopilotEval> {
    throw new ApiError("EVAL_NOT_RUN", "Chưa có báo cáo đánh giá (cần máy chủ thật).", 404);
  },
};
