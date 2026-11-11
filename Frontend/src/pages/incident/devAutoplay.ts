// DEV-ONLY URL hook to reach demo states for screenshots/tests (no effect in production builds):
//   /incident?autoplay=<stage>&stepMs=<n>&mode=replay      stage: v2 | agent | attack | lock | step7
//   /council?autoplay=lock                                  (also seeds council history)
// Runs the in-browser mock flow with 0 latency; `stepMs` = delay between attack steps (0 = instant).
import { useEffect } from "react";
import { api } from "../../lib/api";
import { env } from "../../config/env";
import { mockConfig } from "../../lib/mock/server";
import { useUiStore } from "../../store/uiStore";

let started = false;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitFor(pred: () => Promise<boolean>, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await pred()) return true; await sleep(30); }
  return false;
}

export function useDevAutoplay() {
  useEffect(() => {
    if (!import.meta.env.DEV || started) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("mode") === "replay") useUiStore.getState().setMode("replay");
    if (q.get("measure")) setTimeout(() => { const d = document.documentElement; d.dataset.sh = `${d.scrollHeight}/${window.innerHeight}`; }, 2500);
    const stage = q.get("autoplay");
    if (!stage || env.apiMode !== "mock") return;
    started = true;
    mockConfig.latencyMs = 0;
    mockConfig.stepDelayMs = Number(q.get("stepMs") ?? 0);
    void (async () => {
      await api.applyPolicyV2();
      if (stage === "v2") return;
      if (stage === "council") { await api.lockDistrict({ principalId: "minh", member: "lan" }); return; }
      await api.runAgentOnce();
      if (stage === "agent") return;
      await api.runScene4();
      if (stage === "attack") return;
      await waitFor(async () => (await api.getAttempts()).some((a) => a.step === 5));
      await api.lockDistrict({ principalId: "minh", member: "lan" });
      if (stage === "lock") return;
      await api.runScene4Step7();
    })();
  }, []);
}
