// Drives the "red spreads" animation: reveals the plan's steps one by one (300 ms each) and exposes what is red right now,
// plus the counter value that climbs from Bạn nghĩ to Ước tính as keys are reached.
import { useCallback, useEffect, useMemo, useState } from "react";
import { counterAt, type SpreadPlan } from "../../graph/spread";

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
export const START_DELAY_MS = 450;

export function useSpreadAnimation(plan: SpreadPlan | null, compromised: string[]) {
  const [stepsDone, setStepsDone] = useState(0);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    setStepsDone(0);
    if (!plan) return;
    if (reduced()) { setStepsDone(plan.steps.length); return; }
    const timers = plan.steps.map((s) => setTimeout(() => setStepsDone(s.index + 1), START_DELAY_MS + s.at));
    return () => timers.forEach(clearTimeout);
  }, [plan, nonce]);

  const origins = useMemo(() => new Set(stepsDone > 0 ? compromised : []), [stepsDone, compromised]);
  const { redNodes, redEdges } = useMemo(() => {
    const n = new Set<string>(), e = new Set<string>();
    plan?.steps.slice(0, stepsDone).forEach((s) => { s.nodeIds.forEach((x) => n.add(x)); s.edgeIds.forEach((x) => e.add(x)); });
    return { redNodes: n, redEdges: e };
  }, [plan, stepsDone]);

  const total = plan?.steps.length ?? 0;
  const keysReached = plan ? Math.max(0, stepsDone - 1) : 0;
  return {
    stepsDone, origins, redNodes, redEdges,
    running: !!plan && stepsDone < total,
    done: !!plan && stepsDone >= total,
    keysReached, keysTotal: plan ? plan.onchainCount + plan.declaredCount : 0,
    counter: plan ? counterAt(plan, stepsDone) : 0n,
    replay: useCallback(() => setNonce((x) => x + 1), []),
  };
}
