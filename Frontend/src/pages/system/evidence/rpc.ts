// Plain fetch JSON-RPC (no web3 library). Read-only: only eth_chainId, eth_blockNumber, eth_getCode, eth_call are used here.
import { READ_ALLOW_LIST } from "./deployment";

export class RpcError extends Error {}

/** The L1 public RPC (read-only proxy) from VITE_L1_RPC_URL; "" when not configured (mock / GitHub Pages). */
export const configuredL1Rpc = (): string => (((import.meta.env as Record<string, string | undefined>).VITE_L1_RPC_URL) ?? "").trim();

let nextId = 1;

/** One JSON-RPC call with a timeout. Throws RpcError with a Vietnamese message. */
export async function rpcCall<T = string>(url: string, method: string, params: unknown[] = [], timeoutMs = 8000, fetchImpl: typeof fetch = fetch): Promise<T> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }), signal: ctl.signal });
    if (!res.ok) throw new RpcError(res.status === 429 ? "Máy chủ RPC đang giới hạn lượt gọi, thử lại sau ít phút" : `Máy chủ RPC trả lỗi ${res.status}`);
    const body = (await res.json()) as { result?: T; error?: { message?: string } };
    if (body.error) throw new RpcError(`Nút chain từ chối: ${body.error.message ?? "lỗi không rõ"}`);
    if (body.result === undefined) throw new RpcError("Phản hồi RPC không hợp lệ");
    return body.result;
  } catch (e) {
    if (e instanceof RpcError) throw e;
    if (e instanceof DOMException && e.name === "AbortError") throw new RpcError("Hết thời gian chờ RPC");
    throw new RpcError("Không kết nối được RPC (mạng hoặc CORS)");
  } finally {
    clearTimeout(timer);
  }
}

/** "0xce62d" -> 845357 */
export const hexToNumber = (h: string): number => Number.parseInt(h, 16);

/** Byte length of eth_getCode output ("0x" = 0 = no contract). */
export const codeSizeBytes = (code: string): number => Math.max(0, (code.length - 2) / 2);

/** eth_call data for readAllowList(address). */
export const readAllowListData = (address: string): string => `${READ_ALLOW_LIST}${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;

/** 32-byte word -> role number (0 none, 1 enabled, 2 admin, 3 manager). */
export const parseRole = (word: string): number => Number.parseInt(word.slice(-2) || "0", 16);

export const ROLE_LABEL: Record<number, string> = { 0: "Bị chặn gửi giao dịch", 1: "Được gửi", 2: "Quản trị", 3: "Quản lý" };
export const roleLabel = (r: number): string => ROLE_LABEL[r] ?? `Vai trò ${r}`;

export const readRole = async (url: string, allowList: string, who: string): Promise<number> =>
  parseRole(await rpcCall(url, "eth_call", [{ to: allowList, data: readAllowListData(who) }, "latest"]));

export const readCodeSize = async (url: string, address: string): Promise<number> => codeSizeBytes(await rpcCall(url, "eth_getCode", [address, "latest"]));

export const curlCmd = (url: string, method: string, params: string): string =>
  `curl -s -X POST ${url} -H 'content-type: application/json' \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"${method}","params":${params}}'`;
