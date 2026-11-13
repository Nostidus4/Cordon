// DEV-ONLY URL hooks to reach stage states for screenshots/tests (only reached via a dynamic import behind import.meta.env.DEV, so never in the production bundle):
//   ?autoplay=v2|agent|step5|lock|step7   cumulative mock flow (policy v2 -> morning agent -> attacker 1-5 -> lock -> step 7)
//   ?stepMs=300                           delay between attacker steps (default 0 here, 2600 in the real mock)
//   ?night=1|0                            force night / day
//   ?mode=replay                          Xem lại
//   ?building=B05[&tab=incident|rules|faults] (any scene: opens the building drawer) · window.__stageOverlaps() lists intersecting region slots
//   ?building=B05 (any scene: opens the drawer) · ?fault=F05_KEY_LEAK (mock: injects that fault; add &stepMs=1500 to watch the steps)
//   ?who=minh,huy (try) · ?ask=<id> (try/request) · ?approve=1 (fix) · ?pick=k:key_agent_data (look) · ?end=1 (request)
import { api } from "../lib/api";
import { env } from "../config/env";
import { mockConfig } from "../lib/mock/server";
import { useUiStore } from "../store/uiStore";
import type { BuildingCode } from "./contract";
import { checkSlotOverlaps } from "./overlap";
import { openBuilding, useStageStore, type DrawerTab } from "./stageStore";

let started = false;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function waitFor(pred: () => Promise<boolean>, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(30); }
  return false;
}

export function runStageDevHooks() {
  if (!import.meta.env.DEV || started) return;
  const q = new URLSearchParams(window.location.search);
  if (q.get("mode") === "replay") useUiStore.getState().setMode("replay");
  if (q.get("night")) useStageStore.getState().setNightPref(q.get("night") === "1");
  (window as unknown as { __stageOverlaps: typeof checkSlotOverlaps }).__stageOverlaps = checkSlotOverlaps;
  const b = q.get("building");
  const tab = q.get("tab") as DrawerTab | null;
  if (b) { const open = () => openBuilding(b as BuildingCode, tab); setTimeout(open, 1200); setTimeout(open, 4000); }
  const fault = q.get("fault");
  if (fault && env.apiMode === "mock") { mockConfig.latencyMs = 0; mockConfig.stepDelayMs = Number(q.get("stepMs") ?? 0); setTimeout(() => { void api.injectFault(fault); }, 600); }
  const stage = q.get("autoplay");
  if (!stage || env.apiMode !== "mock") return;
  started = true;
  mockConfig.latencyMs = 0;
  mockConfig.stepDelayMs = Number(q.get("stepMs") ?? 0);
  void (async () => {
    await api.applyPolicyV2();
    if (stage === "v2") return;
    await api.runAgentOnce();
    if (stage === "agent") return;
    await api.runScene4();
    await waitFor(async () => (await api.getAttempts()).some((a) => a.step === 5));
    if (stage === "step5") return;
    await api.lockDistrict({ principalId: "minh", member: "lan" });
    if (stage === "lock") return;
    await api.runScene4Step7();
  })();
}

