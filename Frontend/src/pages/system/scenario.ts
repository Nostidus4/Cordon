// Drives the whole demo from code (used by the "Chạy cả kịch bản" button and the dev-only ?autoplay=full hook).
import { api } from "../../lib/api";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function waitFor(pred: () => Promise<boolean>, ms = 30000, every = 60): Promise<boolean> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(every); }
  return false;
}

export type ScenarioStep = "reset" | "v2" | "agent" | "attack" | "lock" | "step7";
export const STEP_LABEL: Record<ScenarioStep, string> = {
  reset: "Đặt lại", v2: "Áp dụng chính sách v2", agent: "Trợ lý Cân đối chạy", attack: "Kẻ gian bước 1–5", lock: "Khoá khu anh Minh", step7: "Bước 7: thẻ đã bị gạch",
};

/** reset -> v2 -> agent -> attacker 1-5 -> lock minh -> step 7. `gapMs` = pause between steps so a viewer can follow. */
export async function playFullScenario(opts: { gapMs?: number; from?: ScenarioStep; onStep?: (s: ScenarioStep) => void } = {}): Promise<void> {
  const gap = opts.gapMs ?? 900;
  const order: ScenarioStep[] = ["reset", "v2", "agent", "attack", "lock", "step7"];
  for (const s of order.slice(order.indexOf(opts.from ?? "reset"))) {
    opts.onStep?.(s);
    if (s === "reset") await api.resetDemo();
    else if (s === "v2") await api.applyPolicyV2();
    else if (s === "agent") await api.runAgentOnce();
    else if (s === "attack") { await api.runScene4(); await waitFor(async () => (await api.getAttempts()).some((a) => a.step === 5)); }
    else if (s === "lock") await api.lockDistrict({ principalId: "minh", member: "lan" });
    else if (s === "step7") await api.runScene4Step7();
    await sleep(gap);
  }
}
