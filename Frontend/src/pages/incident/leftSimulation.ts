// Left pane 'without Cordon': 5 card caps 20.000, no shared cap, no whitelist, total 100.000 (spec §4.3).
// Computed client-side from shared/scenario4.ts and driven by the step the RIGHT side has received (spec §10.5).
import { KEY_CAP, SCENE4_ATTACK_STEPS } from "../../shared/scenario4";
import type { Attempt } from "../../types";
import { stepOf } from "../../lib/dto";
import type { KeyKind } from "../../types";

export interface KeyMeta { id: string; label: string; kind: KeyKind }

/** The 5 keys of district `minh`, in the order the attacker reaches them (step 1..5). */
const META: Record<string, Omit<KeyMeta, "id">> = {
  key_agent_intl_pay: { label: "Trợ lý Thanh toán quốc tế", kind: "AGENT" },
  key_agent_rebalance: { label: "Trợ lý Cân đối", kind: "AGENT" },
  key_agent_data: { label: "Trợ lý Dữ liệu", kind: "AGENT" },
  key_minh: { label: "Thẻ của anh Minh", kind: "HUMAN" },
  key_svc_payment: { label: "Phần mềm thanh toán", kind: "SERVICE" },
};
export const KEY_ORDER: KeyMeta[] = SCENE4_ATTACK_STEPS.map((s) => ({ id: s.signer, ...META[s.signer] }));
export const keyMeta = (id: string): KeyMeta | undefined => KEY_ORDER.find((k) => k.id === id);

export interface LeftBar extends KeyMeta {
  /** display units */
  spent: number;
  cap: number;
  /** the attacker has drained this card to its personal cap */
  drained: boolean;
  /** this card was hit by the step just received */
  active: boolean;
}
export interface LeftState { step: number; bars: LeftBar[]; total: number; drainedCount: number }

/**
 * With only per-card caps and no whitelist nothing but the card's own cap stops the attacker, so every card that the
 * script reaches (steps 1..5) is drained to KEY_CAP: 5 x 20.000 = 100.000.
 */
export function leftStateAtStep(step: number): LeftState {
  const reached = new Set(SCENE4_ATTACK_STEPS.filter((s) => s.step <= step).map((s) => s.signer));
  const current = SCENE4_ATTACK_STEPS.find((s) => s.step === step)?.signer;
  const bars: LeftBar[] = KEY_ORDER.map((k) => ({
    ...k, cap: KEY_CAP, spent: reached.has(k.id) ? KEY_CAP : 0, drained: reached.has(k.id), active: k.id === current,
  }));
  const total = bars.reduce((n, b) => n + b.spent, 0);
  return { step, bars, total, drainedCount: bars.filter((b) => b.drained).length };
}

/** Left step = the newest scenario step the right side has received (steps 6/7 add nothing on the left, so clamp to 5). */
export function leftStepFromAttempts(attempts: Pick<Attempt, "step">[]): number {
  return attempts.reduce((m, a) => Math.max(m, Math.min(stepOf(a), 5)), 0);
}
