// Demo actions the tour can run ("Tự chạy" / "Chạy giúp bước này"): thin wrappers over src/lib/api + shared ui store. Idempotent where possible.
import { api } from "../lib/api";
import { useUiStore } from "../store/uiStore";
import type { MemberId, Proposal } from "../types";

export interface TourCtx { nav: (to: string) => void }
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Click the first <button> inside `[data-tour="name"]` (e.g. an assistant question). Returns false if absent. */
export function clickInTarget(name: string, pick: (btns: HTMLButtonElement[]) => HTMLButtonElement | undefined = (b) => b[0]): boolean {
  const root = document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
  const btn = root ? pick([...root.querySelectorAll<HTMLButtonElement>("button:not([disabled])")]) : undefined;
  btn?.click();
  return !!btn;
}

const isMerge = (p: Proposal) => p.change?.kind === "merge_district";

export async function findMergeProposal(): Promise<Proposal | undefined> {
  return (await api.getProposals()).filter(isMerge).sort((a, b) => b.id - a.id)[0];
}
/** Scene 3a: create the "gom khu" proposal from finding R1 (proposer Lan). Re-uses an existing one. */
export async function createMerge(ctx: TourCtx): Promise<void> {
  let p = await findMergeProposal();
  if (!p) {
    const f = (await api.getFindings()).find((x) => x.ruleId === "R1_MULTI_KEY_NO_SHARED_CAP" && x.principalId === "minh" && x.proposal);
    if (!f) return;
    p = await api.createProposal({ findingId: f.id, member: "lan" });
  }
  ctx.nav(reqRoute(p.id));
}
const reqRoute = (id?: number) => (id ? `/he-thong/hoi-dong?id=${id}` : "/he-thong/hoi-dong");
const findProposal = async (id: number) => (await api.getProposals()).find((x) => x.id === id);

/**
 * Scene 3b: Lan then Trang approve -> 2/3 -> Council timelock (status stays "open" + `queued`, `eta` set) -> execute once eta passed
 * -> policy v2. The step anchors on the timelock card while we wait. If the timelock is 0 / a keeper already executed, we just observe it.
 */
export async function approveMerge(ctx: TourCtx): Promise<void> {
  let p = await findMergeProposal();
  if (!p) { await createMerge(ctx); p = await findMergeProposal(); }
  if (!p || p.status !== "open") return;
  ctx.nav(reqRoute(p.id));
  await sleep(600);
  for (const m of ["lan", "trang"] as MemberId[]) {
    const cur = await findProposal(p.id);
    if (!cur || cur.status !== "open" || cur.approvals.includes(m) || cur.queued) continue;
    await api.approveProposal(p.id, m);
    await sleep(1300);
  }
  // wait for eta, then execute (same call as the dashboard's "Thực thi": an approver executes; a keeper may beat us to it)
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const cur = await findProposal(p.id);
    if (!cur || cur.status !== "open" || cur.vetoedBy) return;
    if (cur.queued && cur.eta != null && Date.now() / 1000 >= cur.eta) {
      try { await api.executeProposal(p.id, cur.approvals[0] ?? "lan"); } catch { /* keeper executed it first, or not ready yet: re-check */ }
    }
    await sleep(700);
  }
}
/** Route resolver: makes sure the merge proposal exists (skipped steps stay consistent), then points at it. */
export const resolveMergeRoute = async () => {
  let p = await findMergeProposal();
  if (!p) { await createMerge({ nav: () => {} }); p = await findMergeProposal(); }
  return reqRoute(p?.id);
};
/** Route resolver for scene 5: requests #12/#13 only exist after the merge was executed, so fast-forward if needed. */
export const resolveScene5Route = (id: 12 | 13) => async () => {
  let list = await api.getProposals();
  if (!list.some((x) => x.id === id)) {
    await approveMerge({ nav: () => {} });
    list = await api.getProposals();
  }
  return reqRoute(list.some((x) => x.id === id) ? id : undefined);
};

export const selectPrincipals = (ids: string[]) => async () => { useUiStore.getState().setSelectedPrincipals(ids); };
export const lockMinh = async () => { await api.lockDistrict({ principalId: "minh", member: "lan" }); };
