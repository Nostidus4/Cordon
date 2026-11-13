// Live walkthrough against a running sim backend (skipped unless LIVE_API is set). Scenes 2-5 + dashboard reads, end to end through the typed `api`,
// asserting through the same FE helpers the UI uses.
//   LIVE_API=1 VITE_API_MODE=live VITE_API_BASE=http://localhost:8100/api npx vitest run src/lib/api/live.walkthrough.test.ts
import { describe, expect, it } from "vitest";
import { api, ApiError } from ".";
import { SCENE4_STEPS } from "../../shared/scenario4";
import { ASSISTANT_QUESTIONS } from "../../shared/assistantQuestions";
import { policyLabel } from "../policy";
import { fmtPercent } from "../format";
import { deriveView } from "../../pages/incident/incidentView";
import { buildSpreadPlan, counterAt } from "../../graph/spread";
import { ensureV2 } from "../../stage/ensure";
import { requestNumbers } from "../../stage/logic";
import { buildingStatesFrom, latestRunWithSteps, pickTrackedIncident, stepViews, faultsOfBuilding } from "../ops";
import { buildHistory } from "../../pages/council/councilHistory";
import { approvalSummary, callSymbol, conflictCheck, emergencyActions } from "../../pages/system/council.logic";
import { contractOf, filterEvents, summarize } from "../../pages/system/eventLog";
import { traceAttempt } from "../../pages/system/trace";
import { computeAmountIn, verdictOf } from "../../pages/system/agent.logic";
import { policySnapshot } from "../../pages/system/policyState";
import type { GraphSnapshot, MemberId, ProposalDraft } from "../../types";

const a = api;
const R1_MINH = "R1_MULTI_KEY_NO_SHARED_CAP:minh";
const BASE = process.env.VITE_API_BASE ?? "http://localhost:8000/api";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Minimal SSE reader over fetch (Node has no EventSource): collects `event:` names + parsed `data:`. */
function listenSse() {
  const got: { type: string; data: unknown }[] = [];
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
    const graph = await a.getGraph();
    // the scene-2 tiles: "Bạn nghĩ", "Chain chặn", estimated sentence, "% quỹ chính"
    const tiles = (r: Awaited<ReturnType<typeof a.simulate>>) => [r.totals.youThink.display, r.totals.enforced.display, r.totals.estimated.display, fmtPercent(r.totals.percentOfMainTreasury)];
    const r1 = await a.simulate({ compromised: ["minh"] });
    expect(tiles(r1)).toEqual(["20.000", "20.000", "100.000", "5%"]);
    const r2 = await a.simulate({ compromised: ["minh", "huy"] });
    expect(tiles(r2)).toEqual(["60.000", "60.000", "140.000", "7%"]);
    // the counter animation ends on the estimated total
    const plan = buildSpreadPlan(r1, graph, ["minh"]);
    expect(counterAt(plan, plan.steps.length)).toBe(BigInt(r1.totals.estimated.raw));
    expect(counterAt(plan, 0)).toBe(BigInt(r1.totals.youThink.raw));
  });

  it("scene 3: finding -> draft -> proposal -> 2/3 approval -> policy v2 (+ SSE graph_updated)", async () => {
    await a.resetDemo();
    const f = (await a.getFindings()).find((x) => x.id === R1_MINH);
    expect(f?.proposal).toBeTruthy();
    const sse = listenSse();
    await sse.ready;
    try {
      const draft: ProposalDraft = await a.draftProposal({ findingId: R1_MINH });
      expect(draft.riskReportHash).toMatch(/^0x/);
      const p = await a.createProposal({ member: "lan", findingId: R1_MINH, title: draft.title });
      expect(p.status).toBe("open");
      expect((await a.approveProposal(p.id, "lan")).status).toBe("open");
      const done = await a.approveProposal(p.id, "trang");
      expect(done.status).toBe("executed");
      const g = await a.getGraph();
      expect(policyLabel(g)).toBe(2);
      expect(g.districts.find((d) => d.principalId === "minh")?.dailyCap?.display + "/ngày").toBe("30.000/ngày");
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
      run = (await a.getScenarioRuns()).find((r) => r.id === run.id) ?? run;
    }
    expect(run.status).toBe("waiting_lock");
    const byStep = new Map(run.attempts.map((x) => [x.step, x]));
    for (const s of SCENE4_STEPS.filter((x) => x.step >= 1 && x.step <= 5)) {
      expect(byStep.get(s.step)?.reasonCode ?? undefined, `step ${s.step}`).toBe(s.reason);
    }
    // 5k (agent swap) + 10k + 10k (steps 3, 4 got through) = 25k shared; "total 20.000 on the right" is the attacker's part
    expect((await a.getDistrict("minh")).spentToday.display).toBe("25.000");
    const live = deriveView(await a.getAttempts(), false);
    expect(live.sharedSpent).toBe(25_000_000_000n);
    expect(live.agentBase).toBe(5_000_000_000n);
    expect(live.attackerSpent).toBe(20_000_000_000n);

    const lock = await a.lockDistrict({ member: "lan", principalId: "minh" });
    expect(lock.status).toBe("ok");
    const fin = await a.runScene4Step7();
    const s7 = fin.attempts.find((x) => x.step === 7);
    expect(s7?.reasonCode).toBe("BLOCKED_AT_PROTOCOL");
    expect(s7?.outcome).toBe("blocked_at_protocol");
    const after = deriveView(await a.getAttempts(), true);
    expect(after.locked).toBe(true);
    expect(after.step7?.reasonCode).toBe("BLOCKED_AT_PROTOCOL");
    expect(after.attackerSpent).toBe(20_000_000_000n);
  });

  it("scene 5: requests #12 / #13 seeded, Huy is conflicted on #13, the Council executes both", { timeout: 30_000 }, async () => {
    await a.resetDemo();
    const seeded = await a.getProposals();
    expect(seeded.map((p) => p.id).sort()).toEqual([12, 13]);
    // the scene deep-link prerequisite (merge -> policy v2), exactly what the UI runs
    await ensureV2();
    expect(policyLabel(await a.getGraph())).toBe(2);
    const g = await a.getGraph();
    const ps = await a.getProposals();
    const p12 = ps.find((p) => p.id === 12), p13 = ps.find((p) => p.id === 13);
    expect(p12?.status).toBe("open");
    expect(p13?.status).toBe("open");
    const nums = requestNumbers(p12, p13, !!g.districts.find((d) => d.principalId === "minh")?.locked, null);
    expect(nums).toEqual({
      p12: { before: "30.000", after: "130.000", beforePct: "1,5%", afterPct: "6,5%" },
      p13: { before: "40.000", after: "60.000", huyConflicted: true },
    });
    // Huy (member bound to district huy, the subject of #13) cannot approve it: the button is "blocked" in the UI
    await expect(a.approveProposal(13, "huy")).rejects.toMatchObject({ code: "CONFLICT_OF_INTEREST" });
    expect(((await a.getProposals()).find((p) => p.id === 13))?.approvals).toEqual([]);
    // Huy is not conflicted on #12 (subject minh) -> neither blocked in the Council section
    const org = await a.getOrg();
    const huyM = org.council.find((m) => m.id === "huy")!;
    expect(conflictCheck(huyM, p13!).conflict).toBe(true);
    expect(conflictCheck(huyM, p12!).conflict).toBe(false);
    for (const id of [13, 12]) {
      for (const m of ["lan", "trang"] as MemberId[]) {
        const cur = (await a.getProposals()).find((p) => p.id === id)!;
        if (cur.status === "open") await a.approveProposal(id, m);
      }
      const done = (await a.getProposals()).find((p) => p.id === id)!;
      expect(done.status, `#${id}`).toBe("executed");
      expect(approvalSummary(done, org.council).reached).toBe(true);
    }
    const g2 = await a.getGraph();
    expect(g2.districts.find((d) => d.principalId === "minh")?.dailyCap?.display).toBe("130.000");
    expect(g2.districts.find((d) => d.principalId === "huy")?.keys.length).toBeGreaterThan(1);
    // the same approve on an executed proposal is an ApiError, not a crash
    await expect(a.approveProposal(12, "huy")).rejects.toBeInstanceOf(ApiError);
  });

  it("assistant: a fixed question comes back verified", { timeout: 30_000 }, async () => {
    await a.resetDemo();
    const q = ASSISTANT_QUESTIONS.find((x) => x.id === "huy_too")!;
    const ans = await a.askAssistant({ question: q.text, context: { screen: q.screen, principalIds: ["minh"] } });
    expect(ans.questionId).toContain(q.id);
    expect(ans.numbersVerified).toBe(true);
    expect(ans.answer.length).toBeGreaterThan(0);
  });

  it("dashboard reads: every GET succeeds and feeds the /he-thong and /chi-tiet helpers", { timeout: 60_000 }, async () => {
    await a.resetDemo();
    expect((await a.getFindings()).length).toBeGreaterThan(0); // v1: R1 flags are open
    await a.applyPolicyV2();
    await a.runAgentOnce();
    await a.lockDistrict({ member: "lan", principalId: "minh" });
    await a.pauseAll({ member: "trang" });

    const health = await a.getHealth();
    expect(health.chainMode).toBe("sim");
    const org = await a.getOrg();
    expect(org.council).toHaveLength(3);
    expect(org.council.every((m) => /^0x[0-9a-fA-F]{40}$/.test(m.address))).toBe(true);
    const graph: GraphSnapshot = await a.getGraph();
    expect(Object.keys(policySnapshot(graph)).length).toBeGreaterThan(5);
    expect((await a.getDistrict("minh")).keys.length).toBeGreaterThan(0);

    // events: Council history / emergency log resolve the member ADDRESSES in the payloads (API_CONTRACT §2)
    const events = await a.getEvents();
    expect(events.length).toBeGreaterThan(0);
    for (const e of events) { expect(contractOf(e.name)).not.toBe("other"); expect(summarize(e).length, e.name).toBeGreaterThan(0); }
    expect(filterEvents(events, { contracts: new Set(), names: new Set(["Executed"]), q: "" }).length).toBeGreaterThan(0);
    const hist = buildHistory(events, org.council, health.policyVersion - (policyLabel(health) ?? health.policyVersion));
    expect(hist.map((h) => h.title).join("|")).toMatch(/Chị Trang (đề xuất|duyệt) #/);
    expect(hist.some((h) => h.kind === "loosen" && h.policyVersion === 2)).toBe(true);
    expect(hist.some((h) => h.kind === "tighten" && h.title === "Chị Lan khoá khu anh Minh")).toBe(true);
    expect(hist.some((h) => h.kind === "tighten" && h.title === "Chị Trang dừng cả kho")).toBe(true);
    expect(hist.every((h) => !/0x[0-9a-f]{8}/i.test(h.title))).toBe(true); // no raw address leaks into a title
    const em = emergencyActions(events, org.council);
    expect(em.map((x) => x.member).sort()).toEqual(["lan", "trang"]);

    const attempts = await a.getAttempts();
    expect(attempts.length).toBeGreaterThan(0);
    for (const t of attempts) expect(traceAttempt(t).summary.length).toBeGreaterThan(0);

    const proposals = await a.getProposals();
    expect(proposals.length).toBeGreaterThan(0);
    for (const p of proposals) {
      expect(approvalSummary(p, org.council).need).toBe(2);
      for (const c of p.calls) expect(callSymbol(c)).toContain(c.fn);
    }

    expect(buildingStatesFrom(await a.getCityStates())).toBeTruthy();
    expect((await a.getScenarioRuns()).length).toBeGreaterThanOrEqual(0);
    const agentRuns = await a.getAgentRuns();
    expect(agentRuns.length).toBeGreaterThan(0);
    for (const r of agentRuns) { expect(verdictOf(r).kind).toBeTruthy(); computeAmountIn(r); }
    expect(latestRunWithSteps(agentRuns)).toBeTruthy();
    expect(Array.isArray(await a.getAssistantLogs())).toBe(true);

    const buildings = await a.getBuildings();
    expect(buildings).toHaveLength(8);
    const faults = await a.getFaults();
    expect(faults.length).toBeGreaterThan(0);
    for (const b of buildings) faultsOfBuilding(faults, b.id);
    const b04 = await a.getBuilding("B04");
    expect(b04.id).toBe("B04");
    const incidents = await a.getIncidents();
    expect(Array.isArray(incidents)).toBe(true);
    pickTrackedIncident(incidents);
    for (const i of incidents) expect(stepViews(i).length).toBe(i.steps.length);
  });
});
