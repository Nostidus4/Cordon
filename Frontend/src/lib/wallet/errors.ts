// Turns wallet / RPC / contract failures into Vietnamese messages. Never throws.
export class WalletFlowError extends Error {}

const CONTRACT_ERRORS: Record<string, string> = {
  ConflictOfInterest: "Bạn là người được xét, không được duyệt.",
  NotCouncilMember: "Ví này không thuộc Hội đồng.",
  AlreadyApproved: "Ví này đã duyệt đề xuất rồi.",
  ProposalNotOpen: "Đề xuất không còn mở để duyệt.",
  UnknownProposal: "Không tìm thấy đề xuất này trên chain.",
  NotTightening: "Việc này không phải siết, cần Hội đồng duyệt.",
  NeedsThreshold: "Chưa đủ phiếu của Hội đồng.",
  TimelockNotReady: "Chưa hết thời gian chờ.",
};

type Loose = { name?: unknown; code?: unknown; errorName?: unknown; shortMessage?: unknown; message?: unknown; cause?: unknown; data?: unknown };

function chain(err: unknown): Loose[] {
  const out: Loose[] = [];
  let cur: unknown = err;
  while (cur && typeof cur === "object" && out.length < 10) {
    out.push(cur as Loose);
    cur = (cur as Loose).cause;
  }
  return out;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function walletErrorMessage(err: unknown): string {
  if (err instanceof WalletFlowError) return err.message;
  const links = chain(err);
  if (links.some((e) => e.code === 4001 || e.name === "UserRejectedRequestError")) return "Bạn đã từ chối ký trong ví.";
  for (const e of links) {
    const n = str(e.errorName) || str((e.data as Loose | undefined)?.errorName);
    if (n && CONTRACT_ERRORS[n]) return CONTRACT_ERRORS[n]!;
  }
  // some wallets/RPCs only put the error name in the text
  const text = links.map((e) => `${str(e.shortMessage)} ${str(e.message)}`).join(" ");
  for (const [n, msg] of Object.entries(CONTRACT_ERRORS)) if (new RegExp(`\\b${n}\\b`).test(text)) return msg;
  if (links.some((e) => e.code === -32002)) return "Ví đang chờ bạn xử lý một yêu cầu khác, mở ví để tiếp tục.";
  if (links.some((e) => e.name === "HttpRequestError" || e.name === "TimeoutError") || /fetch|network|timed? ?out/i.test(text))
    return "Không kết nối được chain Guardian. Kiểm tra mạng rồi thử lại.";
  if (/insufficient funds|gas/i.test(text)) return "Ví không đủ phí gas hoặc chưa được cấp quyền gửi giao dịch trên chain.";
  if (links.some((e) => e.name === "ChainMismatchError") || /chain/i.test(text)) return "Ví đang ở sai mạng. Hãy chuyển sang Guardian L1.";
  return "Không ký được bằng ví. Thử lại hoặc dùng nút Duyệt thường.";
}
