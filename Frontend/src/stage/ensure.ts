// Scene prerequisites. Every scene can be opened directly (deep link), so entering one makes sure the demo is in the state
// it needs, through the real (mock) API flow: Lan proposes the merge, Lan + Trang approve -> policy v2 -> requests #12/#13 exist.
// Idempotent: calling it twice, or while a merge is half-approved, only does the missing steps.
import { api } from "../lib/api";
import type { MemberId, Proposal } from "../types";
import type { SceneId } from "./contract";
import { policyLabel } from "../lib/policy";

export type Prereq = "any" | "v2";
/** What each scene needs. look/try/fix work in either policy (they show a "chơi lại" chip instead of resetting). */
export const PREREQ: Record<SceneId, Prereq> = { intro: "any", look: "any", try: "any", fix: "any", incident: "v2", request: "v2" };

const isMerge = (p: Proposal) => p.change.kind === "consolidate";
let inflight: Promise<void> | null = null;

/** Brings the demo to policy v2 by running the council flow. Resolves when #12/#13 are there. */
export function ensureV2(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const g = await api.getGraph();
    if ((policyLabel(g) ?? 1) >= 2) return;
    let merge = (await api.getProposals()).filter(isMerge).sort((a, b) => b.id - a.id)[0];
    if (!merge) {
      const f = (await api.getFindings()).find((x) => x.ruleId === "R1_MULTI_KEY_NO_SHARED_CAP" && x.principalId === "minh" && x.suggestedChange);
      if (!f) { await api.applyPolicyV2(); return; } // no finding to start from: fall back to the demo shortcut
      merge = await api.createProposal({ findingId: f.id, proposer: "lan" });
    }
    for (const m of ["lan", "trang"] as MemberId[]) {
      const cur = (await api.getProposals()).find((p) => p.id === merge.id);
      if (!cur || cur.status !== "open") break;
      if (!cur.approvals.some((a) => a.member === m)) await api.approveProposal(merge.id, m);
    }
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Is the demo already in the state this scene needs? */
export const isReady = (scene: SceneId, policyVersion: number | undefined, hasRequests: boolean): boolean =>
  PREREQ[scene] === "any" || (policyVersion !== undefined && policyVersion >= 2 && (scene !== "request" || hasRequests));
