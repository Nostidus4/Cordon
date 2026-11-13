// Mock of B05 Tx Guardian (docs/spec/CITY_OPS.md §7): same operations and rules as the backend, in the browser.
// Simplified on purpose: no daily caps (the mock chain only says no to a recipient/DEX outside the whitelist), 1 tTKB = 1 tUSDC.
import { fmtDisplay } from "../format";
import { REASONS } from "../../shared/reasonCodes";
import type { PreparedTx, PreparedTxInput, StateDiff, TxCheck, TxFinding, TxLevel } from "../../types";
import { fakeAddress, fakeTxHash } from "./core";

export interface MockWorld {
  keys: Record<string, { address: string; label: string; principalId: string }>;
  recipients: string[];
  protocols: string[];
  vaultUsdc: bigint;
}

export class TxGuardError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

const UNLIMITED_FROM = 2n ** 255n;
const DECIMALS: Record<string, number> = { tUSDC: 6, tTKB: 18, tSCAM: 18 };
const bad = (m: string) => new TxGuardError("VALIDATION_ERROR", m, 422);
const money = (v: bigint, sym: string) => ({ raw: v.toString(), display: fmtDisplay(v, DECIMALS[sym] ?? 18) });

let checks: TxCheck[] = [];
let counter = 0;
export const resetTxGuardMock = () => { checks = []; counter = 0; };

function resolve(w: MockWorld, ref: string | null | undefined, name: string): { addr: string; label: string | null; known: boolean; sym: string | null } {
  if (!ref) throw bad(`${name}: bắt buộc`);
  if (w.keys[ref]) return { addr: w.keys[ref].address, label: w.keys[ref].label, known: true, sym: null };
  const byAddr = Object.values(w.keys).find((k) => k.address.toLowerCase() === ref.toLowerCase());
  if (byAddr) return { addr: byAddr.address, label: byAddr.label, known: true, sym: null };
  if (w.recipients.includes(ref) || w.protocols.includes(ref)) return { addr: fakeAddress(ref), label: ref, known: true, sym: null };
  if (ref in DECIMALS) return { addr: fakeAddress(ref), label: null, known: ref !== "tSCAM", sym: ref };
  if (ref === "stranger_wallet") return { addr: fakeAddress(ref), label: "Ví người lạ", known: false, sym: null };
  if (!/^0x[0-9a-fA-F]{40}$/.test(ref)) throw bad(`${name}: địa chỉ không hợp lệ`);
  const known = [...w.recipients, ...w.protocols].find((id) => fakeAddress(id).toLowerCase() === ref.toLowerCase());
  return { addr: ref, label: known ?? null, known: !!known, sym: null };
}

const int = (name: string, v: string | null | undefined, required = true): bigint | null => {
  if (v == null || v === "") { if (required) throw bad(`${name}: bắt buộc`); return null; }
  if (!/^\d+$/.test(v)) throw bad(`${name}: phải là số nguyên không âm`);
  return BigInt(v);
};

function template(kind: string, d: StateDiff, f: TxFinding[], level: TxLevel): string {
  const who = d.recipientLabel ?? (d.recipientKnown ? "một địa chỉ đã duyệt" : "một địa chỉ lạ");
  const parts: string[] = [];
  if (kind === "pay" && d.outflows[0]) parts.push(`Giao dịch này chuyển ${d.outflows[0].amount.display} ${d.outflows[0].token} từ kho tới ${who}.`);
  else if (kind === "swap" && d.outflows[0]) parts.push(`Giao dịch này đổi ${d.outflows[0].amount.display} ${d.outflows[0].token}${d.inflows[0] ? ` lấy khoảng ${d.inflows[0].amount.display} ${d.inflows[0].token}` : ""} qua ${who}.`);
  else if (d.approvals[0]) parts.push(`Giao dịch này cho ${who} quyền tiêu ${d.approvals[0].unlimited ? "không giới hạn số" : d.approvals[0].amount.display} ${d.approvals[0].token} của kho.`);
  else parts.push(`Giao dịch này gọi thẳng tới ${who}, chưa đọc được nó sẽ làm gì với tiền.`);
  if (d.chainReason) parts.push(`Hợp đồng sẽ từ chối giao dịch này: ${REASONS[d.chainReason].vi}.`);
  if (f.length) parts.push(`Cảnh báo: ${f.map((x) => x.titleVi.toLowerCase()).join("; ")}.`);
  parts.push(level === "danger" ? "Nên từ chối giao dịch này." : level === "caution" ? "Nên xem kỹ trước khi gửi." : "Chưa thấy dấu hiệu bất thường, nhưng vẫn nên kiểm tra lại người nhận.");
  return parts.join(" ");
}

export function checkTx(w: MockWorld, p: PreparedTxInput, now: number): TxCheck {
  const prepared: PreparedTx = { ...p, memo: p.memo ?? "", source: p.source ?? "paste" };
  const signer = resolve(w, p.signer, "signer");
  const key = Object.values(w.keys).find((k) => k.address === signer.addr);
  if (!key) throw bad("signer: khoá này chưa có trong tổ chức");
  const to = resolve(w, p.to, "to");
  const outflows: StateDiff["outflows"] = [], inflows: StateDiff["inflows"] = [], approvals: StateDiff["approvals"] = [];
  const findings: TxFinding[] = [];
  const add = (ruleId: string, level: TxFinding["level"], titleVi: string, detailVi: string) => findings.push({ ruleId, level, titleVi, detailVi });
  let reason: StateDiff["chainReason"] = null;
  let simulated = false;
  const tok = p.kind === "raw" ? null : resolve(w, p.token, "token");
  const amount = p.kind === "raw" ? null : int("amount", p.amount)!;
  if (p.kind === "pay" && tok && amount != null) {
    simulated = true;
    outflows.push({ token: tok.sym ?? tok.addr, amount: money(amount, tok.sym ?? "") });
    if (!to.known) reason = "RECIPIENT_NOT_ALLOWED";
    if (tok.sym === "tUSDC" && amount > 0n && amount * 100n >= w.vaultUsdc * 95n) add("drain", "danger", "Rút gần hết số dư", "Số tiền gần bằng toàn bộ số dư của kho với loại tiền này.");
  } else if (p.kind === "swap" && tok && amount != null) {
    simulated = true;
    const out = resolve(w, p.tokenOut, "tokenOut");
    const minOut = int("minOut", p.minOut, false) ?? 0n;
    const quoted = amount * 10n ** BigInt(DECIMALS[out.sym ?? ""] ?? 18) / 10n ** BigInt(DECIMALS[tok.sym ?? ""] ?? 18);
    outflows.push({ token: tok.sym ?? tok.addr, amount: money(amount, tok.sym ?? "") });
    inflows.push({ token: out.sym ?? out.addr, amount: money(quoted, out.sym ?? "") });
    if (!to.known) reason = "PROTOCOL_NOT_ALLOWED";
    if (minOut === 0n) add("abnormal_slippage", "danger", "Không đặt mức giá tối thiểu", "Lệnh đổi chấp nhận nhận về bao nhiêu cũng được, nên dễ bị ép giá.");
    else if ((quoted - minOut) * 100n > quoted * 3n) add("abnormal_slippage", (quoted - minOut) * 100n > quoted * 10n ? "danger" : "caution", "Mức trượt giá bất thường", "Giá tối thiểu thấp hơn giá báo nhiều hơn mức bình thường.");
  } else if (p.kind === "approve" && tok && amount != null) {
    const unlimited = amount >= UNLIMITED_FROM;
    approvals.push({ token: tok.sym ?? tok.addr, spender: to.addr, amount: money(amount, tok.sym ?? ""), unlimited });
    if (unlimited) add("unlimited_approval", "danger", "Cấp quyền không giới hạn", "Giao dịch cho phép bên kia tiêu số tiền không có giới hạn từ kho. Chỉ cấp đúng số cần dùng.");
  } else if (p.kind === "raw" && !/^0x[0-9a-fA-F]*$/.test(p.data ?? "")) throw bad("data: cần dữ liệu dạng hex (0x…)");
  if (!to.known) {
    add("unknown_contract", p.kind === "pay" ? "caution" : "danger", "Địa chỉ chưa được duyệt", "Nơi nhận hoặc hợp đồng được gọi chưa nằm trong danh sách đã duyệt của tổ chức.");
    const hex = (a: string) => a.toLowerCase().replace(/^0x/, "");
    const knownAddrs = [...Object.values(w.keys).map((k) => k.address), ...[...w.recipients, ...w.protocols].map(fakeAddress)];
    if (knownAddrs.some((k) => hex(k) !== hex(to.addr) && hex(k).slice(0, 4) === hex(to.addr).slice(0, 4) && hex(k).slice(-4) === hex(to.addr).slice(-4)))
      add("address_poisoning", "danger", "Địa chỉ giống địa chỉ quen", "Địa chỉ này có đầu và đuôi giống một địa chỉ đã duyệt nhưng không phải nó. Kẻ gian hay dùng cách này để đánh lừa.");
  }
  const level: TxLevel = reason || findings.some((f) => f.level === "danger") ? "danger" : findings.length ? "caution" : "safe";
  const diff: StateDiff = { outflows, inflows, approvals, recipient: to.addr, recipientLabel: to.label, recipientKnown: to.known, principalId: key.principalId, chainReason: reason, simulated };
  const numbers = [
    ...outflows.map((f) => ({ label: "Số tiền chuyển ra", value: f.amount.display })),
    ...inflows.map((f) => ({ label: "Số nhận về (ước tính)", value: f.amount.display })),
    ...approvals.filter((a) => !a.unlimited).map((a) => ({ label: "Số được cấp quyền", value: a.amount.display })),
  ];
  const out: TxCheck = { id: ++counter, createdAt: now, prepared, diff, findings, level, explanationVi: template(p.kind, diff, findings, level), explanationSource: "template", numbers, numbersVerified: true, status: "pending", sentTx: null };
  checks.push(out);
  return structuredClone(out);
}

const find = (id: number): TxCheck => {
  const c = checks.find((x) => x.id === id);
  if (!c) throw new TxGuardError("TX_CHECK_NOT_FOUND", "Không có lần soi giao dịch này.", 404);
  return c;
};
const pending = (c: TxCheck) => {
  if (c.status !== "pending") throw new TxGuardError("TX_CHECK_NOT_PENDING", `Giao dịch này ${c.status === "sent" ? "đã gửi" : "đã bị từ chối"}, không xử lý lại được.`, 409);
};

export const listTxChecks = (limit = 50): TxCheck[] => structuredClone([...checks].reverse().slice(0, limit));
export const getTxCheck = (id: number): TxCheck => structuredClone(find(id));
export function rejectTx(id: number): TxCheck { const c = find(id); pending(c); c.status = "rejected"; return structuredClone(c); }
export function sendTx(id: number): TxCheck {
  const c = find(id); pending(c);
  const ok = c.diff.chainReason === null;
  c.sentTx = { txHash: ok ? fakeTxHash(`txg${id}`) : null, simulated: true, ok, reasonCode: c.diff.chainReason };
  c.status = "sent";
  return structuredClone(c);
}
