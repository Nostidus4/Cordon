import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../../lib/api";
import { deriveView, sortAttempts } from "./incidentView";
import { leftStateAtStep, leftStepFromAttempts } from "./leftSimulation";
import { pickReplayRun, REPLAY_STEP_MS, scheduleReplayStep } from "./replay";
import { stepOf } from "../../lib/dto";

afterEach(() => vi.useRealTimers());

describe("replay cadence", () => {
  it("steps are 3 s apart (+-0.3 s) and stop at total", () => {
    vi.useFakeTimers();
    const total = 8, at: number[] = [], t0 = Date.now();
    let shown = 0, done = false;
    const tick = (): void => {
      scheduleReplayStep(shown, total, REPLAY_STEP_MS, () => { shown++; at.push(Date.now() - t0); tick(); }, () => { done = true; });
    };
    tick();
    vi.advanceTimersByTime(60_000);
    expect(shown).toBe(total);
    expect(done).toBe(true);
    for (let i = 1; i < at.length; i++) expect(Math.abs(at[i] - at[i - 1] - 3000)).toBeLessThanOrEqual(300);
    expect(at[0]).toBe(700);
  });
  it("cancel stops the pending step", () => {
    vi.useFakeTimers();
    const onStep = vi.fn();
    scheduleReplayStep(0, 8, REPLAY_STEP_MS, onStep, () => {})();
    vi.advanceTimersByTime(10_000);
    expect(onStep).not.toHaveBeenCalled();
  });
});

/** The 8 steps of scenario 4 as Replay shows them (duplicated in replay.live.test.ts). */
function expectScene4Replay(attempts: Awaited<ReturnType<typeof api.getAttempts>>) {
  const s = sortAttempts(attempts);
  expect(s.map((a) => stepOf(a))).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(s.map((a) => a.reasonCode ?? "ok")).toEqual([
    "ok", "RECIPIENT_NOT_ALLOWED", "PROTOCOL_NOT_ALLOWED", "ok", "ok", "DISTRICT_DAILY_CAP", "ok", "BLOCKED_AT_PROTOCOL",
  ]);
  expect(s[0].outcome).toBe("ok");
  expect(s[0].amount?.display).toBe("5.000");
  expect(s[7].outcome).toBe("blocked_at_protocol");
  expect(s[7].txHash ?? null).toBeNull();
  const v = deriveView(s, false);
  expect(v.attackerSpent).toBe(20_000_000_000n);
  expect(leftStateAtStep(leftStepFromAttempts(s)).total).toBe(100000);
  // partial view stays in sync: left half follows the newest shown step (clamped to 5)
  for (const n of [1, 3, 6, 8]) {
    const part = s.slice(0, n);
    expect(leftStepFromAttempts(part)).toBe(Math.min(n - 1, 5));
    expect(leftStateAtStep(leftStepFromAttempts(part)).total).toBe(Math.min(n - 1, 5) * 20000);
  }
}

describe("replay of the recorded run (mock api)", () => {
  it("picks the recorded run; 8 steps, right 20.000 / left 100.000", async () => {
    const runs = await api.getScenarioRuns();
    const id = pickReplayRun(runs);
    expect(id).toBe(runs.find((r) => r.status === "recorded")?.id);
    expectScene4Replay(await api.getAttempts(id!));
  });
});
