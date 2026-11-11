import { beforeEach, describe, expect, it } from "vitest";
import { buildGraph, seedState, simulate } from "../lib/mock/core";
import { mockApi, mockConfig } from "../lib/mock/server";
import { ensureV2 } from "./ensure";
import { forgetRequestNumbers } from "./requestMemory";
import {
  buildSpreadPlan, counterAfter, describeNode, incidentNumbers, isStageScene, neighborScene, nextIncidentAction, requestNumbers, sceneFromPath, scenePath, spreadProp, STAGE_SCENES,
} from "./logic";

const U = (n: number) => BigInt(n) * 1_000_000n;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
mockConfig.latencyMs = 0;
mockConfig.stepDelayMs = 0;

describe("scene routing", () => {
  it("maps paths <-> scenes, with / as the intro", () => {
    expect(sceneFromPath("/")).toBe("intro");
    for (const s of STAGE_SCENES) expect(sceneFromPath(scenePath(s))).toBe(s);
    expect(scenePath("intro")).toBe("/");
    expect(scenePath("incident")).toBe("/s/incident");
    expect(sceneFromPath("/s/nope")).toBeNull();
    expect(sceneFromPath("/chi-tiet/map")).toBeNull();
    expect(isStageScene("request")).toBe(true);
    expect(isStageScene("intro")).toBe(false);
  });
  it("arrow keys walk intro -> look -> try -> fix -> incident -> request and clamp at both ends", () => {
    let s = neighborScene("intro", -1);
    expect(s).toBe("intro");
    const seen = [s];
    for (let i = 0; i < 7; i++) { s = neighborScene(s, 1); seen.push(s); }
    expect(seen).toEqual(["intro", "look", "try", "fix", "incident", "request", "request", "request"]);
    expect(neighborScene("look", -1)).toBe("intro");
  });
});

describe("spread counter mapping (spec §8.4 / §10.3)", () => {
  const s = seedState();
  const graph = buildGraph(s, 100);
  const plan = (ids: string[]) => buildSpreadPlan(simulate(s, ids), graph, ids);

  it("minh: counts 20.000 -> 100.000, never down", () => {
    const p = plan(["minh"]);
    const vals = p.steps.map((_, i) => counterAfter(p, i));
    expect([...vals, counterAfter(p, p.steps.length)].map(Number)).toSatisfy((a: number[]) => a.every((v, i) => i === 0 || v >= a[i - 1]));
    expect(counterAfter(p, 0)).toBe(U(20000));
    expect(counterAfter(p, 1)).toBe(U(20000)); // origin only: no key reached yet
    expect(counterAfter(p, p.steps.length)).toBe(U(100000));
  });
  it("minh + huy ends on 140.000", () => {
    const p = plan(["minh", "huy"]);
    expect(counterAfter(p, p.steps.length)).toBe(U(140000));
    expect(p.estimated).toBe(U(140000));
  });
  it("spread prop: step = stepsDone - 1, and synthetic x: edges never reach the city", () => {
    const sim = simulate(s, ["minh"]);
    expect(spreadProp(graph, sim, ["minh"], 0).step).toBe(-1);
    const sp = spreadProp(graph, sim, ["minh"], 3);
    expect(sp.step).toBe(2);
    expect(sp.from).toEqual(["p:minh"]);
    expect(sp.order.length).toBe(6);
    expect(sp.order.flatMap((o) => o.edgeIds).some((e) => e.startsWith("x:"))).toBe(false);
    const ids = new Set(graph.edges.map((e) => e.id));
    expect(sp.order.flatMap((o) => o.edgeIds).every((e) => ids.has(e))).toBe(true);
  });
});

describe("popover text", () => {
  it("a declared control edge is flagged 'tự khai'", () => {
    const g = buildGraph(seedState(), 1);
    const d = describeNode(g, "k:key_agent_data")!;
    expect(d.kind).toBe("robot");
    expect(d.lines.some((l) => l.declared && /anh Minh/.test(l.text))).toBe(true);
    expect(describeNode(g, "p:minh")!.lines.map((l) => l.text)).toContain("Không có cổng chung");
  });
});

describe("incident numbers from the mock flow (spec §4.3 / §10.5)", () => {
  beforeEach(async () => { await mockApi.resetDemo(); });

  it("v2 + agent + attacker 1-5 -> shared 25.000 / 30.000, attacker 20.000, left 100.000; lock and step 7 follow", async () => {
    await mockApi.applyPolicyV2();
    const cap = (await mockApi.getGraph()).districts.find((d) => d.principalId === "minh")!.dailyCap!.raw;
    expect(cap).toBe(U(30000).toString());
    expect(nextIncidentAction(incidentNumbers([], { capRaw: cap }), false)).toBe("agent");

    await mockApi.runAgentOnce();
    let at = await mockApi.getAttempts();
    let n = incidentNumbers(at, { capRaw: cap });
    expect(n.shared).toBe(U(5000));
    expect(nextIncidentAction(n, false)).toBe("attack");

    await mockApi.runScene4();
    for (let i = 0; i < 100 && !(await mockApi.getAttempts()).some((a) => a.step === 5); i++) await wait(10);
    at = await mockApi.getAttempts();
    n = incidentNumbers(at, { capRaw: cap });
    expect(n.shared).toBe(U(25000));
    expect(n.attacker).toBe(U(20000));
    expect(n.leftTotal).toBe(100000);
    expect(n.sharedCap).toEqual({ spent: U(25000).toString(), cap });
    expect(n.attackDone).toBe(true);
    expect(n.locked).toBe(false);
    expect(nextIncidentAction(n, false)).toBe("lock");

    await mockApi.lockDistrict({ principalId: "minh", member: "lan" });
    n = incidentNumbers(await mockApi.getAttempts(), { capRaw: cap, districtLocked: true });
    expect(n.locked).toBe(true);
    expect(nextIncidentAction(n, false)).toBe("step7");

    await mockApi.runScene4Step7();
    n = incidentNumbers(await mockApi.getAttempts(), { capRaw: cap, districtLocked: true });
    expect(n.step7Done).toBe(true);
    expect(n.attacker).toBe(U(20000)); // the rejected step 7 adds nothing
    expect(nextIncidentAction(n, false)).toBe("done");
  });

  it("before any attempt nothing is shown", () => {
    const n = incidentNumbers([], { capRaw: U(30000).toString() });
    expect(n.shared).toBeNull();
    expect(n.sharedCap).toBeNull();
    expect(n.leftTotal).toBe(0);
  });
});

describe("numbers the fix / request scenes show", () => {
  beforeEach(async () => { await mockApi.resetDemo(); });
  it("scene 3 draft: Rủi ro thật 100.000 -> 30.000, Chain chặn 20.000 -> 30.000", async () => {
    const f = (await mockApi.getFindings()).find((x) => x.ruleId === "R1_MULTI_KEY_NO_SHARED_CAP" && x.principalId === "minh")!;
    const d = await mockApi.draftProposal({ findingId: f.id });
    expect([d.riskReport.before.estimated.display, d.riskReport.after.estimated.display]).toEqual(["100.000", "30.000"]);
    expect([d.riskReport.before.enforced.display, d.riskReport.after.enforced.display]).toEqual(["20.000", "30.000"]);
  });
  it("scene 5: #12 30.000 -> 130.000 and #13 has Huy as the conflicted member", async () => {
    await mockApi.applyPolicyV2();
    const ps = await mockApi.getProposals();
    const p12 = ps.find((p) => p.id === 12)!, p13 = ps.find((p) => p.id === 13)!;
    expect([p12.riskReport.before.enforced.display, p12.riskReport.after.enforced.display]).toEqual(["30.000", "130.000"]);
    expect(p13.conflictedMembers).toContain("huy");
    expect([p13.riskReport.before.enforced.display, p13.riskReport.after.enforced.display]).toEqual(["40.000", "60.000"]);
  });
});

describe("scene 5 numbers on deep link and after playing 1-4 (never 0 / post-lock)", () => {
  const expectStory = (n: ReturnType<typeof requestNumbers>) => {
    expect(n).not.toBeNull();
    expect(n!.p12).toEqual({ before: "30.000", after: "130.000", beforePct: "1,5%", afterPct: "6,5%" });
    expect([n!.p13.before, n!.p13.after, n!.p13.huyConflicted]).toEqual(["40.000", "60.000", true]);
  };
  const pick = async () => { const ps = await mockApi.getProposals(); return [ps.find((p) => p.id === 12), ps.find((p) => p.id === 13)] as const; };
  beforeEach(async () => { await mockApi.resetDemo(); forgetRequestNumbers(); });

  it("fresh state: there is nothing yet (skeleton), then the council flow of ensureV2 provides the story numbers", async () => {
    const [a0, b0] = await pick();
    expect(requestNumbers(a0, b0, false, null)).toBeNull();
    await ensureV2();
    expect((await mockApi.getGraph()).policyVersion).toBe(2);
    const [a, b] = await pick();
    expectStory(requestNumbers(a, b, false, null));
    await ensureV2(); // idempotent
    expect((await mockApi.getProposals()).filter((p) => p.change.kind === "consolidate")).toHaveLength(1);
  });

  it("after scenes 1-4 (agent, attack, lock): the live report collapses to 0, the remembered snapshot still tells the story", async () => {
    await ensureV2();
    let [a, b] = await pick();
    const snap = requestNumbers(a, b, false, null)!; // what useRememberRequestNumbers keeps while Minh is open
    expectStory(snap);
    await mockApi.runAgentOnce();
    await mockApi.runScene4();
    for (let i = 0; i < 100 && !(await mockApi.getAttempts()).some((x) => x.step === 5); i++) await wait(10);
    await mockApi.lockDistrict({ principalId: "minh", member: "lan" });
    await mockApi.runScene4Step7();
    [a, b] = await pick();
    expect(a!.riskReport.after.enforced.display).toBe("130.000"); // spec §6.5: the report is frozen at propose, locking minh does not change it
    expect(requestNumbers(a, b, true, null)).toBeNull(); // no snapshot -> skeleton, not zeros
    expectStory(requestNumbers(a, b, true, snap));
  });

  it("a half-finished merge (proposed, Lan approved) is completed by ensureV2", async () => {
    const f = (await mockApi.getFindings())[0];
    const p = await mockApi.createProposal({ findingId: f.id, proposer: "lan" });
    await mockApi.approveProposal(p.id, "lan");
    await ensureV2();
    const [a, b] = await pick();
    expectStory(requestNumbers(a, b, false, null));
  });
});
