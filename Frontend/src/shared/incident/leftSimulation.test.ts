import { describe, expect, it } from "vitest";
import { leftStateAtStep, leftStepFromAttempts, KEY_ORDER } from "./leftSimulation";
import { KEY_CAP } from "../../shared/scenario4";

describe("left pane 'without Cordon' (spec §4.3)", () => {
  it("left pane totals 100.000 after steps 1-5", () => {
    const s = leftStateAtStep(5);
    expect(s.total).toBe(100_000);
    expect(s.bars).toHaveLength(5);
    expect(s.bars.every((b) => b.spent === KEY_CAP && b.cap === 20_000 && b.drained)).toBe(true);
  });
  it("starts at 0 and grows card by card, one per step", () => {
    expect(leftStateAtStep(0).total).toBe(0);
    expect([1, 2, 3, 4, 5].map((n) => leftStateAtStep(n).total)).toEqual([20_000, 40_000, 60_000, 80_000, 100_000]);
  });
  it("bar order follows the attacker's signer order and marks the active card", () => {
    expect(KEY_ORDER.map((k) => k.id)).toEqual(["key_agent_intl_pay", "key_agent_rebalance", "key_agent_data", "key_minh", "key_svc_payment"]);
    expect(leftStateAtStep(3).bars.find((b) => b.active)?.id).toBe("key_agent_data");
    expect(leftStateAtStep(0).bars.some((b) => b.active)).toBe(false);
  });
  it("syncs to the newest step received on the right (steps 6/7 clamp to 5)", () => {
    expect(leftStepFromAttempts([])).toBe(0);
    expect(leftStepFromAttempts([{ step: 0 }])).toBe(0);
    expect(leftStepFromAttempts([{ step: 0 }, { step: 1 }, { step: 2 }, { step: 3 }])).toBe(3);
    expect(leftStepFromAttempts([{ step: 3 }, { step: 1 }])).toBe(3);
    expect(leftStepFromAttempts([0, 1, 2, 3, 4, 5, 6, 7].map((step) => ({ step })))).toBe(5);
    expect(leftStateAtStep(leftStepFromAttempts([0, 1, 2, 3, 4, 5, 6, 7].map((step) => ({ step })))).total).toBe(100_000);
  });
});
