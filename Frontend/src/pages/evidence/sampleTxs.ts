// Curated real transactions on the Guardian L1 (chain 845357) that a judge can check one by one. Each hash was read from the
// chain (blocks 0..1111, receipts + decoded events); docs/EVIDENCE_TXS.md has the scan and the `cast` commands.
// Static on purpose: with no RPC the page shows this list marked "chưa đọc trực tiếp"; with VITE_L1_RPC_URL it reads each receipt.

export type Expect = "ok" | "revert";

export interface SampleTx {
  id: string;
  /** What this transaction proves, one plain Vietnamese sentence. */
  label: string;
  hash: string;
  block: number;
  /** Which deployed set (the chain holds several: earlier QA runs plus the frozen one). */
  set: string;
  contract: string;
  contractAddress: string;
  expect: Expect;
  /** Vietnamese label of the event / refusal that the data file says this tx has. */
  outcome: string;
  /** Mono detail line: event or error name as in the contract. */
  detail: string;
  /** True when the refusal reason is derived from the recorded sequence (the node no longer keeps old state to replay it). */
  inferred?: boolean;
}

const SET_980 = "Bộ hợp đồng khối 980 (lần chạy cảnh 4 và 5)";
const SET_59 = "Bộ hợp đồng khối 59 (lần chạy đầu)";
const SET_835 = "Bộ hợp đồng đăng từ khối 835 (lần chạy thử)";
const SET_NOW = "Bộ hợp đồng hiện tại (khối 1057)";
const SET_GENESIS = "Bộ hợp đồng đầu tiên (đăng từ khối 3)";

const V980 = "0x07127c19b2e53ea4Fec0f866F66Cb56b52596F37";
const C980 = "0x44e461ed1BC90D1F7ca65bEa935D3Ee98C5D916F";

export const SAMPLE_TXS: readonly SampleTx[] = [
  {
    id: "swap-ok", label: "Trợ lý Cân đối đổi 5.000 tUSDC sang tTKB qua sàn đối tác: được phép, chain ghi sổ",
    hash: "0x33f080eed50e8e3bbc61f2d7decf3d361aba85ac3e9f2f9679daba4596c31d90", block: 1043, set: SET_980, contract: "Kho chi tiêu", contractAddress: V980,
    expect: "ok", outcome: "Đổi thành công, khu đã tiêu 5.000", detail: "Swapped · PolicyVault",
  },
  {
    id: "pay-ok", label: "Trợ lý Dữ liệu trả 10.000 cho người nhận trong danh sách: được phép, khu đã tiêu 15.000",
    hash: "0xde126e689587f7667322a122ccfdbe9e220130dc227254c2ba62c8ac088037e3", block: 1046, set: SET_980, contract: "Kho chi tiêu", contractAddress: V980,
    expect: "ok", outcome: "Trả thành công, khu đã tiêu 15.000 trên hạn mức chung 30.000", detail: "Paid · PolicyVault",
  },
  {
    id: "district-cap", label: "Khu đã tiêu 25.000 trên hạn mức chung 30.000; khoản trả thêm 10.000 của khoá khác trong khu bị chain từ chối",
    hash: "0xbfce471d5e5ae90f19a6e273d826b7fefdaba6a73e28fd1b0ca7543f04c2a7ee", block: 1048, set: SET_980, contract: "Kho chi tiêu", contractAddress: V980,
    expect: "revert", outcome: "Bị chặn: vượt hạn mức chung của khu", detail: "PrincipalDailyCapExceeded", inferred: true,
  },
  {
    id: "recipient", label: "Khoá Thanh toán quốc tế trả cho ví lạ ngoài danh sách người nhận: bị chặn",
    hash: "0x94d750ebe613592dbd4b7c755316a986a9278f992c15055f88a828fb21b1fa45", block: 115, set: SET_59, contract: "Kho chi tiêu", contractAddress: "0x19415a753D1cE9FC3C9F385879F5Ca250Eb50efD",
    expect: "revert", outcome: "Bị chặn: người nhận không nằm trong danh sách cho phép", detail: "RecipientNotAllowed",
  },
  {
    id: "protocol", label: "Khoá Cân đối đổi qua sàn giả mạo (không có trong danh sách giao thức): bị chặn",
    hash: "0x4d99b1f27161d1f03adab20e8e8269223ee56c7cf9395a928d85ec615dd73d00", block: 116, set: SET_59, contract: "Kho chi tiêu", contractAddress: "0x19415a753D1cE9FC3C9F385879F5Ca250Eb50efD",
    expect: "revert", outcome: "Bị chặn: sàn/giao thức không được phép", detail: "ProtocolNotAllowed",
  },
  {
    id: "lock", label: "Một mình chị Lan (1 thành viên Hội đồng) khoá khẩn cấp khu: 5 khoá bị chain chặn gửi giao dịch (vai trò về 0)",
    hash: "0x50555bcd7b51413bfc26023a5abd32c78a35a0ae3858a8867d05648f0437f464", block: 1049, set: SET_980, contract: "Hội đồng 2/3", contractAddress: C980,
    expect: "ok", outcome: "Khoá khu ngay, 5 khoá bị đưa về vai trò 0 ở luật gửi giao dịch", detail: "EmergencyAction · PrincipalLocked · RoleSet×5 (Tx AllowList 0x0200…0002)",
  },
  {
    id: "loosen-propose", label: "Nới hạn mức chung khu Minh 30.000 lên 130.000: Hội đồng mở đề xuất (nới thì cần 2/3)",
    hash: "0xaff93c17f1641020294f7cd9f87f4af465208b85ff06562832da4a8e27d0aeb2", block: 1037, set: SET_980, contract: "Hội đồng 2/3", contractAddress: C980,
    expect: "ok", outcome: "Đề xuất số 12 được mở", detail: "Proposed",
  },
  {
    id: "loosen-approve-1", label: "Chị Trang tán thành đề xuất nới: mới 1/3 phiếu, chưa đủ",
    hash: "0x923da7c115512a6bf8778266f74cf3ac3474605ae1e50c410f3ad3273c169584", block: 1050, set: SET_980, contract: "Hội đồng 2/3", contractAddress: C980,
    expect: "ok", outcome: "Có 1 phiếu, chưa vào hàng chờ", detail: "Approved",
  },
  {
    id: "loosen-approve-2", label: "Chị Lan tán thành: đủ 2/3, đề xuất vào hàng chờ độ trễ (15 giây trong bản demo)",
    hash: "0x26661338eeed519ba0424465a2cc5b3f1a280e37d786b7eb6d43612540440131", block: 1051, set: SET_980, contract: "Hội đồng 2/3", contractAddress: C980,
    expect: "ok", outcome: "Đủ 2/3 phiếu, vào hàng chờ", detail: "Approved · Queued",
  },
  {
    id: "loosen-execute", label: "Hết độ trễ, đề xuất được thi hành: hạn mức chung của khu đổi từ 30.000 lên 130.000",
    hash: "0x865f6e2320a56e675820c62fff866efbf05e6465557d2fc160aee194a3a22b2a", block: 1052, set: SET_980, contract: "Hội đồng 2/3", contractAddress: C980,
    expect: "ok", outcome: "Thi hành xong, hạn mức chung 30.000 thành 130.000", detail: "CapChanged · PolicyVersionBumped · Executed",
  },
  {
    id: "conflict", label: "Anh Huy tán thành đề xuất giao khoá cho chính khu của mình: bị từ chối vì xung đột lợi ích",
    hash: "0xbb2d146f0b4834b886559b5c78ba0576f0d55cb940e71a9bb0c177eadef81ec3", block: 901, set: SET_835, contract: "Hội đồng 2/3", contractAddress: "0xe5a4F0DA66836cB79fAC4618101C8CFf5e49AB02",
    expect: "revert", outcome: "Bị chặn: xung đột lợi ích", detail: "ConflictOfInterest",
  },
  {
    id: "handover-genesis", label: "Ví triển khai giao quyền quản trị luật gửi giao dịch của chain cho Hội đồng (vai trò 2)",
    hash: "0xfddcbc6307c5f9a53dcf5657451e3f36b386e67c86bc729471f8ca99e3525b66", block: 25, set: SET_GENESIS, contract: "Tx AllowList (có sẵn trong chain)", contractAddress: "0x0200000000000000000000000000000000000002",
    expect: "ok", outcome: "Hội đồng trở thành quản trị luật gửi giao dịch", detail: "setAdmin · RoleSet(role 2)",
  },
  {
    id: "handover-vote", label: "Hội đồng cũ biểu quyết 2/3 rồi chuyển quyền quản trị cả hai luật chain sang Hội đồng của bộ hiện tại",
    hash: "0x8a350e3884b737a6c6b29384226720201a25c6586cc04414097da6ca5cfb08cb", block: 1089, set: SET_NOW, contract: "Hội đồng 2/3 (bộ cũ thi hành)", contractAddress: C980,
    expect: "ok", outcome: "Hội đồng mới có vai trò 2, Hội đồng cũ về 0", detail: "Executed · RoleSet×4 (cả hai precompile)",
  },
];

// ---------------------------------------------------------------------------------------------------------------------
// Pure mapping from a JSON-RPC receipt to what the page shows. No fetch here, so it is unit-testable.

export interface RpcReceipt { status?: string; blockNumber?: string }

export type SampleView =
  | { state: "static" }
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "missing" }
  | { state: "read"; block: number; status: "success" | "blocked"; statusLabel: string; blockMatches: boolean; expectMatches: boolean };

export const STATUS_LABEL = { success: "Thành công", blocked: "Bị chặn" } as const;

/** "0x1" -> success, "0x0" -> blocked (the transaction was mined and reverted). Anything else is not a verdict. */
export function receiptStatus(r: RpcReceipt): "success" | "blocked" | null {
  if (r.status === "0x1") return "success";
  if (r.status === "0x0") return "blocked";
  return null;
}

/** Turn a receipt (or null when the node does not know the hash) into the row state. */
export function sampleView(tx: SampleTx, receipt: RpcReceipt | null): SampleView {
  if (receipt === null) return { state: "missing" };
  const status = receiptStatus(receipt);
  if (status === null || !receipt.blockNumber) return { state: "error", message: "Biên nhận không có trạng thái" };
  const block = Number.parseInt(receipt.blockNumber, 16);
  const expected = tx.expect === "ok" ? "success" : "blocked";
  return { state: "read", block, status, statusLabel: STATUS_LABEL[status], blockMatches: block === tx.block, expectMatches: status === expected };
}

/** `cast` command a judge can paste to read the same receipt. */
export const castReceiptCmd = (hash: string, rpc: string): string => `cast receipt ${hash} --rpc-url ${rpc || "$RPC"}`;
