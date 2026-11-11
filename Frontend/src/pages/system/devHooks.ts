// DEV-ONLY URL hooks for screenshots / tests (stripped from production by import.meta.env.DEV):
//   /he-thong?autoplay=full|v2|agent|attack|lock|step7   cumulative flow from a fresh reset (full = everything, incl. assistant questions)
//   &stepMs=300                                          delay between attacker steps (default 0 here, 2600 in the real mock)
//   &ask=1                                               also ask the 4 assistant questions
//   &open=<n>                                            (handled by Pipeline) open the drawer of the n-th newest attempt (1 = newest)
import { useEffect } from "react";
import { api, env } from "../../lib/api";
import { mockConfig } from "../../lib/mock/server";
import { ASSISTANT_QUESTIONS } from "../../shared/assistantQuestions";
import { waitFor } from "./scenario";

let started = false;
export function useSystemDevHooks() {
  useEffect(() => {
    if (!import.meta.env.DEV || started) return;
    const q = new URLSearchParams(window.location.search);
    const stage = q.get("autoplay");
    if (!stage || env.apiMode !== "mock") return;
    started = true;
    mockConfig.latencyMs = 0;
    mockConfig.stepDelayMs = Number(q.get("stepMs") ?? 0);
    void (async () => {
      const g = () => new Promise<void>((r) => setTimeout(r, 120));
      await api.resetDemo(); await g();
      await api.applyPolicyV2(); await g();
      if (stage === "v2") return;
      await api.runAgentOnce(); await g();
      if (stage === "agent") return;
      await api.runScene4();
      await waitFor(async () => (await api.getAttempts()).some((a) => a.step === 5), 20000, 30);
      await g();
      if (stage === "attack") return;
      await api.lockDistrict({ principalId: "minh", member: "lan" }); await g();
      if (stage === "lock") return;
      await api.runScene4Step7(); await g();
      if (q.get("ask") === "1" || stage === "full") for (const x of ASSISTANT_QUESTIONS) { await api.askAssistant({ question: x.text, context: { screen: x.screen } }); await g(); }
    })();
  }, []);
}
