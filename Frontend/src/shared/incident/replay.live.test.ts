// Replay against a running sim backend (skipped unless LIVE_API is set).
//   LIVE_API=1 VITE_API_MODE=live VITE_API_BASE=http://localhost:8100/api npx vitest run src/pages/incident/replay.live.test.ts
import { describe, expect, it } from "vitest";
import { api } from "../../lib/api";
import { pickReplayRun } from "./replay";
import { deriveView, sortAttempts } from "./incidentView";
import { leftStateAtStep, leftStepFromAttempts } from "./leftSimulation";
import { stepOf } from "../../lib/dto";

/** Same assertions as replay.test.ts (not imported: that file would register its mock-api tests here). */
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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe.skipIf(!process.env.LIVE_API)("live replay (sim backend)", () => {
  it("replays the run that just finished", { timeout: 60_000 }, async () => {
    await api.resetDemo();
    await api.applyPolicyV2();
    await api.runAgentOnce();
    let run = await api.runScene4();
    for (let i = 0; i < 100 && run.status !== "waiting_lock"; i++) {
      await sleep(500);
      run = (await api.getScenarioRuns()).find((r) => r.id === run.id) ?? run;
    }
    expect(run.status).toBe("waiting_lock");
    expect((await api.lockDistrict({ member: "lan", principalId: "minh" })).status).toBe("ok");
    await api.runScene4Step7();

    const id = pickReplayRun(await api.getScenarioRuns());
    expect(id).toBe(run.id);
    expectScene4Replay(await api.getAttempts(id!));
  });
});
