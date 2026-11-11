// DEV-only URL hooks for screenshots/demos (never bundled in prod: guarded by import.meta.env.DEV at the call site).
//   ?devstate=merge-pre    create the merge proposal (Lan proposes), do not approve
//   ?devstate=merge-live   create it, then (after ~4s) Lan + Trang approve while the page is open (execution animation)
//   ?devstate=merged       fast-forward: create + approve -> policy v2 + requests #12/#13 seeded
//   ?devstate=s5           merged + ask the Huy question in the assistant panel (open /requests?id=12)
import { api } from "../lib/api";
import { approveMerge, clickInTarget, createMerge, sleep } from "./actions";

let started = false; // StrictMode runs effects twice in dev
export async function runDevState(nav: (to: string) => void, sp: URLSearchParams): Promise<void> {
  const mode = sp.get("devstate");
  if (!mode || started) return;
  started = true;
  const ctx = { nav };
  await sleep(300);
  if (mode === "merge-pre") { await createMerge(ctx); return; }
  if (mode === "merge-live") { await createMerge(ctx); await sleep(4500); await approveMerge(ctx); return; }
  if (mode === "merged" || mode === "s5") {
    await createMerge({ nav: () => {} }); await approveMerge({ nav: () => {} });
    if (mode === "s5") {
      nav("/chi-tiet/requests?id=12");
      for (let i = 0; i < 20; i++) { await sleep(300); if (clickInTarget("req-assistant")) break; }
    }
    return;
  }
  void api;
}
