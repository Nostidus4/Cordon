import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useGraph } from "../hooks/useGraph";
import { useProposals } from "../hooks/useProposals";
import type { SceneId } from "./contract";
import { ensureV2, isReady, PREREQ } from "./ensure";
import { policyLabel } from "../lib/policy";

/** Makes the demo state match the scene on entry. `preparing` is true while that runs (show "Đang chuẩn bị cảnh…"). */
export function useEnsureScene(scene: SceneId | null): { preparing: boolean } {
  const qc = useQueryClient();
  const { data: graph } = useGraph();
  const { data: proposals } = useProposals();
  const [busy, setBusy] = useState(false);
  const loaded = !!graph && !!proposals;
  const ready = !!scene && loaded && isReady(scene, policyLabel(graph), !!proposals?.some((p) => p.id === 12) && !!proposals?.some((p) => p.id === 13));
  const needs = !!scene && PREREQ[scene] === "v2" && loaded && !ready;
  useEffect(() => {
    if (!needs) return;
    setBusy(true);
    ensureV2().catch(() => {}).finally(() => { setBusy(false); void qc.invalidateQueries(); });
  }, [needs, qc]);
  return { preparing: needs || busy };
}
