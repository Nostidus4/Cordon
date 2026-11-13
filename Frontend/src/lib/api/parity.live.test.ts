// Parity (QA-001): the same five-scene script through the `Api` interface on the in-browser mock and on a live FastAPI sim backend,
// figures compared section by section. Skipped unless PARITY=1; then it starts the backend itself (uv run uvicorn, CHAIN_MODE=sim).
// On a failing diff: Expected (-) = live backend, Received (+) = mock.
//   cd Frontend && PARITY=1 npx vitest run src/lib/api/parity.live.test.ts
import { spawn, type ChildProcess } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SCENE4_STEPS } from "../../shared/scenario4";
import type { Attempt, Finding, MemberId, Money, Proposal, SimResult } from "../../types";
import type { Api } from "./endpoints";
import { stepOf } from "../dto";

const PORT = process.env.PARITY_PORT ?? "8199";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const money = (m: Money | null | undefined) => (m ? m.display : null);
const tiles = (r: SimResult) => [r.totals.youThink, r.totals.enforced, r.totals.estimated].map((m) => m.display).concat(String(r.totals.percentOfMainTreasury).replace(".", ","));
const findingsOf = (fs: Finding[]) => fs.map((f) => ({ id: f.id, rule: f.ruleId, severity: f.severity })).sort((a, b) => a.id.localeCompare(b.id));
const proposalsOf = (ps: Proposal[]) => ps.map((p) => ({ id: p.id, proposer: p.proposer, approvals: [...p.approvals].sort(), status: p.status, threshold: p.threshold })).sort((a, b) => a.id - b.id);
// the mock stores the morning swap as step null, the backend as step 0 (the FE reads both via `stepOf`)
const attemptsOf = (as: Attempt[]) => as.map((a) => ({ ...a, step: stepOf(a) })).sort((a, b) => a.step - b.step).map((a) => ({ step: a.step, outcome: a.outcome, reasonCode: a.reasonCode, principalSpentAfter: money(a.principalSpentAfter) }));
// event names in order; ids and timestamps are not compared (hashes, blocks, addresses differ by design)
// (the seeded requests #12/#13 are proposed at reset on the backend but only after the merge on the mock: left out until the mock seeds at reset)
const eventNames = async (a: Api) => (await a.getEvents()).filter((e) => !(e.name === "Proposed" && [12, 13].includes(Number(e.payload.id)))).sort((x, y) => x.block - y.block || x.logIndex - y.logIndex).map((e) => e.name);
async function districts(a: Api) {
  const g = await a.getGraph();
  // the backend graph also lists the agent / service principals; the mock only the human districts
  return g.districts.filter((d) => ["huy", "lan", "minh"].includes(d.principalId)).map((d) => ({ id: d.principalId, cap: money(d.dailyCap), locked: !!d.locked })).sort((x, y) => x.id.localeCompare(y.id));
}

/** The five-scene script; returns a normalised snapshot (money as display strings, no ids / times / hashes / addresses). */
async function play(a: Api): Promise<Record<string, unknown>> {
  const snap: Record<string, unknown> = {};
  // scene 2 (+ rows 3/4 of §4.5: policy v2, then the seeded request #12)
  await a.resetDemo();
  snap.v1 = { minh: tiles(await a.simulate({ compromised: ["minh"] })), minhHuy: tiles(await a.simulate({ compromised: ["minh", "huy"] })), findings: findingsOf(await a.getFindings()), districts: await districts(a) };
  await a.applyPolicyV2();
  const p12 = (await a.getProposals()).find((p) => p.id === 12)!;
  const v2 = await a.simulate({ compromised: ["minh"] });
  const withChange = await a.simulate({ compromised: ["minh"], change: p12.change! });
  snap.v2 = { minh: tiles(v2), request12: tiles((withChange.after ?? withChange) as SimResult), findings: findingsOf(await a.getFindings()), districts: await districts(a) };

  // scene 3: finding -> proposal -> 2/3 -> policy v2
  await a.resetDemo();
  const fid = "R1_MULTI_KEY_NO_SHARED_CAP:minh";
  const draft = await a.draftProposal({ findingId: fid });
  const made = await a.createProposal({ member: "lan", findingId: fid, title: draft.title });
  const afterLan = await a.approveProposal(made.id, "lan");
  const done = await a.approveProposal(made.id, "trang");
  snap.scene3 = { draft: { classification: draft.classification, requiresCouncil: draft.requiresCouncil, before: tiles({ totals: draft.riskReport.before } as SimResult), after: tiles({ totals: draft.riskReport.after } as SimResult) },
    afterLan: proposalsOf([afterLan]), done: proposalsOf([done]), policyVersion: (await a.getHealth()).policyVersion, districts: await districts(a), findings: findingsOf(await a.getFindings()), events: await eventNames(a) };

  // scene 4: agent swap (step 0), attack steps 1-5, lock, step 7
  await a.resetDemo();
  await a.applyPolicyV2();
  const run0 = await a.runAgentOnce();
  const sharedAfter0 = money((await a.getDistrict("minh")).spentToday);
  let run = await a.runScene4();
  for (let i = 0; i < 100 && run.status !== "waiting_lock"; i++) { await sleep(100); run = (await a.getScenarioRuns()).find((r) => r.id === run.id) ?? run; }
  const attacks = attemptsOf(run.attempts), status = run.status; // the mock hands out live objects: read before the lock mutates them
  const lock = await a.lockDistrict({ member: "lan", principalId: "minh" });
  const fin = await a.runScene4Step7();
  const d = await a.getDistrict("minh");
  snap.scene4 = { step0: { outcome: run0.outcome, reasonCode: run0.reasonCode, principalSpentAfter: sharedAfter0 }, attacks, status, lock: lock.status, step7: attemptsOf(fin.attempts).filter((x) => x.step === 7),
    district: { cap: money(d.dailyCap), spent: money(d.spentToday), locked: d.locked }, districts: await districts(a), events: await eventNames(a) };

  // scene 5: requests #12 / #13, Huy conflicted on #13
  await a.resetDemo();
  await a.applyPolicyV2();
  const seeded = proposalsOf(await a.getProposals());
  const conflict = await a.approveProposal(13, "huy").then(() => null, (e: { code: string }) => e.code);
  for (const id of [13, 12]) for (const m of ["lan", "trang"] as MemberId[]) { if ((await a.getProposals()).find((p) => p.id === id)?.status === "open") await a.approveProposal(id, m); }
  snap.scene5 = { seeded, conflict, final: proposalsOf(await a.getProposals()), districts: await districts(a), policyVersion: (await a.getHealth()).policyVersion, events: await eventNames(a) };
  // emergency: Trang pauses the whole treasury (event names after it)
  await a.pauseAll({ member: "trang" });
  // cut at the pause: the backend responder then proposes a recovery on its own, the mock only does that for injected faults
  const names = await eventNames(a);
  snap.scene5 = { ...(snap.scene5 as object), eventsAfterPause: names.slice(0, names.lastIndexOf("EmergencyAction") + 1) };
  return snap;
}

describe.skipIf(!process.env.PARITY)("mock vs live parity (sim backend)", () => {
  let server: ChildProcess | undefined;
  let mock: Api, live: Api;
  let mockSnap: Record<string, any>, liveSnap: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

  beforeAll(async () => {
    vi.stubEnv("VITE_API_BASE", `http://127.0.0.1:${PORT}/api`);
    const { mockConfig, mockApi } = await import("../mock/server");
    mockConfig.latencyMs = 0; mockConfig.stepDelayMs = 0;
    mock = mockApi as Api;
    live = (await import("./endpoints")).liveApi;
    server = spawn("uv", ["run", "uvicorn", "guardian.main:app", "--port", PORT], {
      cwd: new URL("../../../../Backend", import.meta.url).pathname, stdio: "pipe",
      env: { ...process.env, CHAIN_MODE: "sim", DEMO_MODE: "true", DATABASE_URL: "", LLM_ENABLED: "false", SCENARIO_DELAY_SECONDS: "0.1", RATE_LIMIT_PER_MINUTE: "100000" },
    });
    let log = "";
    server.stdout?.on("data", (c) => (log += c)); server.stderr?.on("data", (c) => (log += c));
    for (let i = 0; i < 120; i++) {
      if (server.exitCode !== null) throw new Error(`backend exited early:\n${log}`);
      try { if ((await fetch(`http://127.0.0.1:${PORT}/api/health`)).ok) break; } catch { /* not up yet */ }
      if (i === 119) throw new Error(`backend not healthy:\n${log}`);
      await sleep(500);
    }
    mockSnap = await play(mock) as typeof mockSnap;
    liveSnap = await play(live) as typeof liveSnap;
  }, 110_000);
  afterAll(() => { server?.kill("SIGTERM"); });

  it("acceptance figures (spec §4.5 rows)", () => {
    for (const s of [mockSnap, liveSnap]) {
      expect(s.v1.minh).toEqual(["20.000", "20.000", "100.000", "5"]);
      expect(s.v1.minhHuy).toEqual(["60.000", "60.000", "140.000", "7"]);
      expect(s.v2.minh).toEqual(["30.000", "30.000", "30.000", "1,5"]);
      expect(s.v2.request12).toEqual(["130.000", "130.000", "130.000", "6,5"]);
      expect(s.scene4.step0.principalSpentAfter).toBe("5.000");
      const dots = (n: number) => String(n).replace(/\B(?=(\d{3})+$)/g, ".");
      expect(s.scene4.attacks).toEqual(SCENE4_STEPS.filter((x) => x.step <= 5).map((x) => ({ step: x.step, outcome: x.expect, reasonCode: x.reason ?? null, principalSpentAfter: dots(x.sharedAfter!) })));
      expect(s.scene4.status).toBe("waiting_lock");
      expect(s.scene4.step7).toEqual([{ step: 7, outcome: "blocked_at_protocol", reasonCode: "BLOCKED_AT_PROTOCOL", principalSpentAfter: null }]);
    }
  });
  for (const section of ["v1", "v2", "scene3", "scene4", "scene5"]) {
    it(`section ${section} is equal on mock and live`, () => { expect(mockSnap[section]).toEqual(liveSnap[section]); });
  }
});
