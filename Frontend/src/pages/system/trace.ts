// Per-attempt check trace: replays the PolicyVault check order (spec §6.3) against an attempt and marks which check failed.
// Computed from the attempt's own outcome + reasonCode, so it is consistent with what the chain reported by construction.
import { REASONS, type ReasonCode } from "../../shared/reasonCodes";
import type { Attempt } from "../../types";

export type CheckId = "paused" | "registered" | "unlocked" | "token" | "target" | "keycap" | "districtcap" | "transfer";
export type StageStatus = "pass" | "fail" | "skip";

export interface CheckDef { id: CheckId; n: number; label: string; code: string; reasons: ReasonCode[] }

/** §6.3, in order. `target` is the recipient check for `pay`, the protocol/selector check for `swap`. */
export const CHECKS: CheckDef[] = [
  { id: "paused", n: 1, label: "Kho đang chạy", code: "!paused", reasons: ["VAULT_PAUSED"] },
  { id: "registered", n: 2, label: "Thẻ đã đăng ký", code: "registry.principalOf(key)", reasons: ["KEY_NOT_REGISTERED"] },
  { id: "unlocked", n: 3, label: "Khu chưa khoá", code: "!principalLocked[id]", reasons: ["DISTRICT_LOCKED"] },
  { id: "token", n: 4, label: "Loại tiền duyệt", code: "tokenAllowed[token]", reasons: ["TOKEN_NOT_ALLOWED"] },
  { id: "target", n: 5, label: "Bến / chợ duyệt", code: "recipientAllowed[to] | protocolAllowed[dex][sel]", reasons: ["RECIPIENT_NOT_ALLOWED", "PROTOCOL_NOT_ALLOWED"] },
  { id: "keycap", n: 6, label: "Hạn mức thẻ", code: "keySpent + v ≤ keyDailyCap", reasons: ["CARD_DAILY_CAP"] },
  { id: "districtcap", n: 7, label: "Hạn mức khu", code: "principalSpent + v ≤ principalDailyCap", reasons: ["DISTRICT_DAILY_CAP"] },
  { id: "transfer", n: 8, label: "Chuyển / đổi tiền", code: "transfer · amountOut ≥ minOut", reasons: ["SLIPPAGE"] },
];

export interface CheckStage extends CheckDef { status: StageStatus }

export interface AttemptTrace {
  /** vault = pay/swap through PolicyVault; council = emergency (tighten) action; direct = call to another contract, never touches PolicyVault */
  route: "vault" | "council" | "direct";
  /** the node's Tx AllowList (precompile), checked before the tx enters a block */
  gate: "pass" | "fail";
  stages: CheckStage[];
  failId: CheckId | null;
  summary: string;
}

const stageForReason = (code: ReasonCode): CheckId | null => CHECKS.find((c) => c.reasons.includes(code))?.id ?? null;

export function traceAttempt(a: Pick<Attempt, "action" | "outcome" | "reasonCode">): AttemptTrace {
  const blank = (status: StageStatus): CheckStage[] => CHECKS.map((c) => ({ ...c, status }));
  if (a.action === "lock") {
    return { route: "council", gate: "pass", stages: blank("skip"), failId: null, summary: "GuardianCouncil.emergencyLock → PolicyVault.lockPrincipal + TxAllowList.setNone cho từng thẻ (siết: 1 người đủ)" };
  }
  if (a.outcome === "blocked_at_protocol") {
    return { route: a.action === "approve" || a.action === "raw_call" ? "direct" : "vault", gate: "fail", stages: blank("skip"), failId: null, summary: "Node từ chối trước khi vào block (không có trong Tx AllowList): không có tx hash, không có event" };
  }
  if (a.action === "approve" || a.action === "raw_call") {
    return { route: "direct", gate: "pass", stages: blank("skip"), failId: null, summary: "Gọi thẳng contract token, không đi qua PolicyVault: chỉ Tx AllowList đứng chắn" };
  }
  if (a.outcome === "ok") {
    return { route: "vault", gate: "pass", stages: blank("pass"), failId: null, summary: "Qua cả 8 kiểm tra, bộ đếm được cập nhật trước khi gọi ra ngoài" };
  }
  const failId = a.reasonCode ? stageForReason(a.reasonCode) : null;
  const failIdx = failId ? CHECKS.findIndex((c) => c.id === failId) : -1;
  const stages = CHECKS.map<CheckStage>((c, i) => ({ ...c, status: failIdx < 0 ? "skip" : i < failIdx ? "pass" : i === failIdx ? "fail" : "skip" }));
  return { route: "vault", gate: "pass", stages, failId, summary: a.reasonCode ? `Dừng ở kiểm tra ${failIdx + 1}: ${REASONS[a.reasonCode].vi}` : "Bị revert" };
}

/** Human-readable call, e.g. PolicyVault.pay(tUSDC, vendor_cloud, 10.000) */
export function callSignature(a: Pick<Attempt, "action" | "signer" | "token" | "to" | "amount"> & { principalId?: string | null }): string {
  switch (a.action) {
    case "pay": return `PolicyVault.pay(${a.token ?? "tUSDC"}, ${a.to ?? "?"}, ${a.amount?.display ?? "?"})`;
    case "swap": return `PolicyVault.swap(${a.to ?? "?"}, ${a.token ?? "tUSDC"} → tTKB, ${a.amount?.display ?? "?"})`;
    case "lock": return `GuardianCouncil.emergencyLock(${a.principalId ?? "id"})`;
    default: return `${a.token ?? "token"}.approve(…)`;
  }
}

/** The custom error name shown next to a reason code, e.g. PrincipalDailyCapExceeded() */
export const errorName = (c: ReasonCode | null): string | null => (c && REASONS[c].error ? `${REASONS[c].error}()` : null);
