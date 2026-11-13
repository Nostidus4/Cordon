// B05 Tx Guardian panel logic (CITY-003), kept free of React so it can be tested without a DOM.
import type { Api } from "../lib/api";
import type { GraphNode, PreparedTxInput, TxCheck, TxKind, TxLevel } from "../types";

export const KIND_VI: Record<TxKind, string> = { pay: "Chuyển tiền", swap: "Đổi token", approve: "Cấp quyền", raw: "Lệnh thô" };
export const LEVEL_VI: Record<TxLevel, string> = { safe: "An toàn", caution: "Cần xem kỹ", danger: "Nguy hiểm" };
export const STATUS_VI: Record<TxCheck["status"], string> = { pending: "Chờ quyết định", sent: "Đã gửi", rejected: "Đã từ chối" };
export const SOURCE_VI: Record<NonNullable<TxCheck["prepared"]["source"]>, string> = { paste: "Dán tay", city: "Từ thành phố", copilot: "Trợ lý", attacker: "Kẻ tấn công" };

/** Reject goes to the reject endpoint and nothing else: it never signs, never sends. */
export const rejectCheck = (api: Pick<Api, "rejectTx">, id: number): Promise<TxCheck> => api.rejectTx(id);
export const sendCheck = (api: Pick<Api, "sendTx">, id: number): Promise<TxCheck> => api.sendTx(id);

export interface FormOption { ref: string; label: string; decimals?: number; allowed?: boolean }
export interface FormOptions { keys: FormOption[]; recipients: FormOption[]; protocols: FormOption[]; tokens: FormOption[] }

const TOKEN_DECIMALS: Record<string, number> = { tUSDC: 6, tTKB: 18, tSCAM: 18 };
/** The reference the backend accepts for a graph node: live ids carry the address (`k:0x…`), mock ids the seed id (`k:key_minh`). */
const refOf = (n: GraphNode) => n.id.replace(/^[a-z]+:/, "");

export function formOptions(nodes: GraphNode[]): FormOptions {
  const pick = (type: GraphNode["type"]) =>
    nodes.filter((n) => n.type === type).map((n): FormOption => ({
      ref: refOf(n), label: n.label,
      decimals: typeof n.data.decimals === "number" ? n.data.decimals : TOKEN_DECIMALS[n.label],
      allowed: typeof n.data.allowListed === "boolean" ? n.data.allowListed : undefined,
    }));
  return { keys: pick("Key"), recipients: pick("Recipient"), protocols: pick("Protocol"), tokens: pick("Token") };
}

/** "1.000" / "1000" / "1,5" typed by a person -> base units as a decimal string; null when it is not a plain amount. */
export function toBaseUnits(text: string, decimals: number): string | null {
  const t = text.trim().replace(/\./g, "").replace(",", ".");
  const m = /^(\d+)(?:\.(\d+))?$/.exec(t);
  if (!m) return null;
  const frac = m[2] ?? "";
  if (frac.length > decimals) return null;
  return (BigInt(m[1]) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, "0") || "0")).toString();
}

export interface TxForm {
  kind: TxKind; signer: string; token: string; tokenOut: string; to: string; amount: string; minOut: string; data: string;
}

/** The form -> PreparedTx, or a Vietnamese reason why it is not ready yet. */
export function buildPrepared(f: TxForm, decimalsOf: (tokenRef: string) => number): { tx: PreparedTxInput } | { error: string } {
  if (!f.signer) return { error: "Chọn thẻ ký giao dịch." };
  if (!f.to.trim()) return { error: f.kind === "raw" ? "Điền nơi gọi tới." : "Điền người nhận." };
  if (f.kind === "raw") {
    if (!/^0x[0-9a-fA-F]*$/.test(f.data.trim())) return { error: "Dữ liệu lệnh phải bắt đầu bằng 0x." };
    return { tx: { kind: "raw", signer: f.signer, to: f.to.trim(), data: f.data.trim(), source: "paste" } };
  }
  if (!f.token) return { error: "Chọn loại tiền." };
  const amount = toBaseUnits(f.amount, decimalsOf(f.token));
  if (amount === null || amount === "0") return { error: "Số tiền chưa đúng." };
  const tx: PreparedTxInput = { kind: f.kind, signer: f.signer, token: f.token, to: f.to.trim(), amount, source: "paste" };
  if (f.kind === "swap") {
    if (!f.tokenOut) return { error: "Chọn loại tiền nhận về." };
    tx.tokenOut = f.tokenOut;
    if (f.minOut.trim()) {
      const min = toBaseUnits(f.minOut, decimalsOf(f.tokenOut));
      if (min === null) return { error: "Số nhận tối thiểu chưa đúng." };
      tx.minOut = min;
    }
  }
  return { tx };
}

/** Short, human form of an address for the muted line (the explanation never shows one). */
export const shortAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
