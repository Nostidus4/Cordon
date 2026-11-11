// Scene 4 steps (spec §4.3), mirror of backend shared/scenario4.py. Canonical district-cap code: DISTRICT_DAILY_CAP (§6.4; §4.3 'PRINCIPAL_DAILY_CAP' is a spec typo).
import type { ReasonCode } from "./reasonCodes";

export interface Scene4Step {
  step: number;
  time: string;
  signer: string; // key id, or council member for the lock
  who: "agent" | "attacker" | "council";
  kind: "pay" | "swap" | "lock" | "approve";
  token?: string;
  tokenOut?: string;
  to?: string;
  dex?: string;
  amount?: bigint; // base units (6 dec)
  label: string;
  expect: "ok" | "reverted" | "blocked_at_protocol";
  reason?: ReasonCode;
  /** District shared spent after this step (display units), spec §4.3 last column. null = n/a */
  sharedAfter: number | null;
}

const U = (n: number) => BigInt(n) * 1_000_000n;

export const SCENE4_STEPS: Scene4Step[] = [
  { step: 0, time: "09:00", signer: "key_agent_rebalance", who: "agent", kind: "swap", token: "tUSDC", tokenOut: "tTKB", dex: "MockDEX", amount: U(5000), label: "Swap 5.000 tUSDC → tTKB qua MockDEX", expect: "ok", sharedAfter: 5000 },
  { step: 1, time: "14:01", signer: "key_agent_intl_pay", who: "attacker", kind: "pay", token: "tUSDC", to: "stranger_wallet", amount: U(20000), label: "Trả 20.000 tUSDC → ví lạ", expect: "reverted", reason: "RECIPIENT_NOT_ALLOWED", sharedAfter: 5000 },
  { step: 2, time: "14:02", signer: "key_agent_rebalance", who: "attacker", kind: "swap", token: "tUSDC", tokenOut: "tTKB", dex: "EvilDEX", amount: U(10000), label: "Swap tUSDC → tTKB qua EvilDEX", expect: "reverted", reason: "PROTOCOL_NOT_ALLOWED", sharedAfter: 5000 },
  { step: 3, time: "14:02", signer: "key_agent_data", who: "attacker", kind: "pay", token: "tUSDC", to: "vendor_data_api", amount: U(10000), label: "Trả 10.000 tUSDC → vendor_data_api", expect: "ok", sharedAfter: 15000 },
  { step: 4, time: "14:03", signer: "key_minh", who: "attacker", kind: "pay", token: "tUSDC", to: "vendor_cloud", amount: U(10000), label: "Trả 10.000 tUSDC → vendor_cloud", expect: "ok", sharedAfter: 25000 },
  { step: 5, time: "14:03", signer: "key_svc_payment", who: "attacker", kind: "pay", token: "tUSDC", to: "vendor_cloud", amount: U(10000), label: "Trả 10.000 tUSDC → vendor_cloud", expect: "reverted", reason: "DISTRICT_DAILY_CAP", sharedAfter: 25000 },
  { step: 6, time: "14:04", signer: "lan", who: "council", kind: "lock", label: "Lan khoá khu minh: lockPrincipal(minh), 5 thẻ bị gạch khỏi chain", expect: "ok", sharedAfter: null },
  { step: 7, time: "14:05", signer: "key_minh", who: "attacker", kind: "approve", token: "tSCAM", label: "Thử gọi tSCAM.approve (contract khác)", expect: "blocked_at_protocol", reason: "BLOCKED_AT_PROTOCOL", sharedAfter: null },
];

export const SCENE4_ATTACK_STEPS = SCENE4_STEPS.filter((s) => s.step >= 1 && s.step <= 5);
export const DISTRICT_CAP_V2 = 30_000;
export const KEY_CAP = 20_000;
export const MAIN_TREASURY = 2_000_000;
