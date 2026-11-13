// Live walkthrough against a running sim backend (skipped unless LIVE_API is set). Scenes 2-4 of the demo, end to end through the real `api`.
//   LIVE_API=1 VITE_API_MODE=live VITE_API_BASE=http://localhost:8100/api npx vitest run src/lib/api/live.walkthrough.test.ts
// Typed loosely on purpose: it asserts the BACKEND wire shapes (Backend/src/guardian/schemas), whatever the FE types say today.
import { describe, expect, it } from "vitest";
import { api } from ".";
import { SCENE4_STEPS } from "../../shared/scenario4";

/* eslint-disable @typescript-eslint/no-explicit-any */
const a = api as any;
const R1_MINH = "R1_MULTI_KEY_NO_SHARED_CAP:minh";
const BASE = process.env.VITE_API_BASE ?? "http://localhost:8000/api";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Minimal SSE reader over fetch (Node has no EventSource): collects `event:` names + parsed `data:`. */
function listenSse() {
  const got: { type: string; data: any }[] = [];
  const ctl = new AbortController();
  const ready = (async () => {
    const res = await fetch(`${BASE}/stream`, { signal: ctl.signal });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) return;
          buf += dec.decode(value, { stream: true });
          let i: number;
          while ((i = buf.search(/\r?\n\r?\n/)) >= 0) {
            const block = buf.slice(0, i); buf = buf.slice(i).replace(/^\r?\n\r?\n/, "");
            let type = "message", data = "";
            for (const line of block.split(/\r?\n/)) {
              if (line.startsWith("event:")) type = line.slice(6).trim();
              else if (line.startsWith("data:")) data += line.slice(5).trim();
            }
            if (data) try { got.push({ type, data: JSON.parse(data) }); } catch { /* ping / non-json */ }
          }
        }
      } catch { /* aborted */ }
    })();
  })();
  return { got, ready, stop: () => ctl.abort() };
}

describe.skipIf(!process.env.LIVE_API)("live walkthrough (sim backend)", () => {
  it("scene 2: simulate compromised keys", async () => {
    await a.resetDemo();
    const t1 = (await a.simulate({ compromised: ["minh"] })).totals;
    expect([t1.youThink.display, t1.enforced.display, t1.estimated.display, t1.percentOfMainTreasury]).toEqual(["20.000", "20.000", "100.000", 5]);
    const t2 = (await a.simulate({ compromised: ["minh", "huy"] })).totals;
    expect([t2.youThink.display, t2.enforced.display, t2.estimated.display, t2.percentOfMainTreasury]).toEqual(["60.000", "60.000", "140.000", 7]);
  });

  it("scene 3: finding -> draft -> proposal -> 2/3 approval -> policy v2 (+ SSE graph_updated)", async () => {
    await a.resetDemo();
    expect((await a.getFindings()).map((f: any) => f.id)).toContain(R1_MINH);
    const sse = listenSse();
    await sse.ready;
    try {
      const draft = await a.draftProposal({ findingId: R1_MINH });
      expect(draft.riskReportHash).toMatch(/^0x/);
      const p = await a.createProposal({ member: "lan", findingId: R1_MINH, title: draft.title });
      expect(p.status).toBe("open");
      expect((await a.approveProposal(p.id, "lan")).status).toBe("open");
      const done = await a.approveProposal(p.id, "trang");
      expect(done.status).toBe("executed");
      const g = await a.getGraph();
      expect(g.policyLabel).toBe(2);
      expect(g.districts.find((d: any) => d.principalId === "minh").dailyCap.display).toBe("30.000");
      for (let i = 0; i < 20 && !sse.got.some((m) => m.type === "graph_updated"); i++) await sleep(100);
      expect(sse.got.map((m) => m.type)).toContain("graph_updated");
    } finally { sse.stop(); }
  });

  it("scene 4: agent run-once, attack steps 1-5, lock, step 7", { timeout: 60_000 }, async () => {
    await a.resetDemo();
    await a.applyPolicyV2();
    const run1 = await a.runAgentOnce();
    expect(run1.outcome).toBe("swapped");

    let run = await a.runScene4();
    for (let i = 0; i < 100 && run.status !== "waiting_lock"; i++) {
      await sleep(500);
      run = (await a.getScenarioRuns()).find((r: any) => r.id === run.id);
    }
    expect(run.status).toBe("waiting_lock");
    const byStep = new Map<number, any>(run.attempts.map((x: any) => [x.step, x]));
    for (const s of SCENE4_STEPS.filter((x) => x.step >= 1 && x.step <= 5)) {
      expect(byStep.get(s.step)?.reasonCode ?? undefined, `step ${s.step}`).toBe(s.reason);
    }
    // 5k (agent swap) + 10k + 10k (steps 3, 4 got through) = 25k; the attacker's part is the 20k
    expect((await a.getDistrict("minh")).spentToday.display).toBe("25.000");

    const lock = await a.lockDistrict({ member: "lan", principalId: "minh" });
    expect(lock.status).toBe("ok");
    const fin = await a.runScene4Step7();
    const s7 = fin.attempts.find((x: any) => x.step === 7);
    expect(s7.reasonCode).toBe("BLOCKED_AT_PROTOCOL");
    expect(s7.outcome).toBe("blocked_at_protocol");
  });
});
