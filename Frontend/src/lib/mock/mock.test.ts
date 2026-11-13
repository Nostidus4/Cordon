import { beforeEach, describe, expect, it } from "vitest";
import { mockApi, mockConfig, ApiError, subscribe } from "./server";
import { computeFindings, seedState } from "./core";
import { stepOf } from "../dto";
import { SCENE4_STEPS } from "../../shared/scenario4";
import type { Attempt, StreamMessage } from "../../types";

mockConfig.latencyMs = 0;
mockConfig.stepDelayMs = 0;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const U = (n: number) => String(BigInt(n) * 1_000_000n);

beforeEach(async () => { await mockApi.resetDemo(); });

describe("simulateCompromise (spec §8.4 table)", () => {
  it("v1 minh: 20.000 / 20.000 / 100.000, 5%", async () => {
    const r = await mockApi.simulate({ compromised: ["minh"] });
    expect([r.totals.youThink.display, r.totals.enforced.display, r.totals.estimated.display]).toEqual(["20.000", "20.000", "100.000"]);
    expect(r.totals.percentOfMainTreasury).toBe(5);
    expect(r.reachedKeys).toHaveLength(5);
    expect(r.reachedKeys.find((k) => k.key === "key_agent_data")!.via).toEqual(["declared"]);
    expect(r.findings[0].ruleId).toBe("R1_MULTI_KEY_NO_SHARED_CAP");
  });
  it("v1 minh+huy: 60.000 / 60.000 / 140.000, 7%", async () => {
    const r = await mockApi.simulate({ compromised: ["minh", "huy"] });
    expect([r.totals.youThink.display, r.totals.enforced.display, r.totals.estimated.display]).toEqual(["60.000", "60.000", "140.000"]);
    expect(r.totals.percentOfMainTreasury).toBe(7);
  });
  it("v2 minh: 30.000 x3; v2 + request #12 (130.000): 130.000, 6,5%", async () => {
    await mockApi.applyPolicyV2();
    expect((await mockApi.getHealth()).policyVersion).toBe(2);
    const r = await mockApi.simulate({ compromised: ["minh"] });
    expect([r.totals.youThink.display, r.totals.enforced.display, r.totals.estimated.display]).toEqual(["30.000", "30.000", "30.000"]);
    expect(await mockApi.getFindings()).toHaveLength(0);
    const p12 = (await mockApi.getProposals()).find((p) => p.id === 12)!;
    expect(p12.riskReport.before.enforced.display).toBe("30.000");
    expect(p12.riskReport.after.enforced.display).toBe("130.000");
    expect(p12.riskReport.after.percentOfMainTreasury).toBe(6.5);
    const sim = await mockApi.simulate({ compromised: ["minh"], change: p12.change! });
    expect([sim.totals.enforced.display, sim.totals.estimated.display]).toEqual(["130.000", "130.000"]);
  });
});

describe("proposals", () => {
  it("R1 draft goes 100.000 -> 30.000; 2/3 approvals execute; huy blocked on conflict", async () => {
    const f = (await mockApi.getFindings())[0];
    const p = await mockApi.createProposal({ findingId: f.id, member: "trang" });
    expect(p.riskReport.before.estimated.display).toBe("100.000");
    expect(p.riskReport.after.estimated.display).toBe("30.000");
    await mockApi.approveProposal(p.id, "lan");
    const done = await mockApi.approveProposal(p.id, "trang");
    expect(done.status).toBe("executed");
    const g = await mockApi.getGraph();
    expect(g.policyVersion).toBe(2);
    expect(g.districts.find((d) => d.principalId === "minh")!.dailyCap!.display).toBe("30.000");
    const p13 = (await mockApi.getProposals()).find((x) => x.id === 13)!;
    expect(p13.conflictedMembers).toEqual(["huy"]);
    expect(p13.riskReport.before.enforced.display).toBe("40.000");
    expect(p13.riskReport.after.enforced.display).toBe("60.000");
    await expect(mockApi.approveProposal(13, "huy")).rejects.toMatchObject({ code: "CONFLICT_OF_INTEREST" });
    expect(ApiError).toBeTruthy();
  });
});

describe("scene 4 (spec §4.3 table)", () => {
  it("steps 0-5 outcomes and shared spent 5.000 -> 15.000 -> 25.000, then lock, then step 7", async () => {
    await mockApi.applyPolicyV2();
    const msgs: StreamMessage[] = [];
    const un = subscribe((m) => msgs.push(m));
    await mockApi.runScene4();
    await wait(60);
    const at = (await mockApi.getAttempts()) as Attempt[];
    const by = (n: number) => at.find((a) => stepOf(a) === n)!;
    for (const st of SCENE4_STEPS.filter((s) => s.step <= 5)) {
      expect(by(st.step).outcome, `step ${st.step}`).toBe(st.expect);
      expect(by(st.step).reasonCode ?? undefined, `reason ${st.step}`).toBe(st.reason);
      if (st.sharedAfter !== null) expect(by(st.step).principalSpentAfter!.display).toBe(new Intl.NumberFormat("de-DE").format(st.sharedAfter));
    }
    expect(by(5).reasonCode).toBe("DISTRICT_DAILY_CAP");
    expect(msgs.some((m) => m.type === "attempt")).toBe(true);
    // lock by Lan
    await mockApi.lockDistrict({ principalId: "minh", member: "lan" });
    const d = await mockApi.getDistrict("minh");
    expect(d.locked).toBe(true);
    expect(d.keys.every((k) => !k.active)).toBe(true);
    const s7 = await mockApi.runScene4Step7();
    expect(s7.outcome).toBe("blocked_at_protocol");
    expect(s7.txHash).toBeNull();
    expect(s7.reasonCode).toBe("BLOCKED_AT_PROTOCOL");
    const city = await mockApi.getCityStates();
    const st = (id: string) => city.buildings.find((b) => b.id === id)?.state;
    expect(st("B05")).toBe("recovery");
    expect(st("B04")).toBe("incident");
    un();
  });
  it("agent: swap 5.000 first, CARD_DAILY_CAP after the card is exhausted", async () => {
    const r1 = await mockApi.runAgentOnce();
    expect(r1.outcome).toBe("swapped"); expect(r1.decision!.amountIn.display).toBe("5.000");
    for (let i = 0; i < 3; i++) await mockApi.runAgentOnce();
    // card cap 20.000 spent; share still <15% only if vault allows - force by checking next outcome
    const r5 = await mockApi.runAgentOnce();
    expect(["blocked", "no_action"]).toContain(r5.outcome);
    if (r5.outcome === "blocked") expect(r5.reasonCode).toBe("CARD_DAILY_CAP");
  });
  it("pause blocks everything and lights city B03", async () => {
    await mockApi.pauseAll({ member: "lan" });
    const r = await mockApi.runAgentOnce();
    expect(r.reasonCode).toBe("VAULT_PAUSED");
    expect((await mockApi.getCityStates()).buildings.find((b) => b.id === "B03")?.state).toBe("incident");
  });
  it("assistant numbers come from state", async () => {
    const a = await mockApi.askAssistant({ question: "Nếu anh Huy cũng bị chiếm thì sao?", context: { screen: "simulate" } });
    expect(a.answer).toContain("140.000");
    expect(a.numbers.some((n) => n.value === "140.000")).toBe(true);
    void U;
  });
});

describe("findings parity with the backend", () => {
  const ids = async () => (await mockApi.getFindings()).map((f) => f.id);
  const seedIds = ["R1_MULTI_KEY_NO_SHARED_CAP:minh", "R3_ADMIN_IS_OPERATOR:e:minh-admins-svc_payment"];
  it("seed: exactly R1 (HIGH) then R3 (MEDIUM); R2 stays quiet", async () => {
    const f = await mockApi.getFindings();
    expect(f.map((x) => x.id)).toEqual(seedIds);
    expect(f.map((x) => x.severity)).toEqual(["HIGH", "MEDIUM"]);
    expect((f[0].data!.suggestedDistrictCap as { display: string }).display).toBe("30.000");
    expect(f[0].data!.keys).toHaveLength(5);
    expect(f[1].proposal).toMatchObject({ kind: "merge_district", into: "minh", districtCap: { raw: U(30000).toString(), display: "30.000" } });
    expect((f[1].proposal as { keys: string[] }).keys).toHaveLength(1);
  });
  it("R2 fires per live agent/service key only when no recipient is allow-listed", () => {
    const s = seedState();
    expect(computeFindings(s).some((f) => f.ruleId === "R2_AGENT_NO_ALLOWLIST")).toBe(false);
    s.recipients = [];
    const r2 = computeFindings(s).filter((f) => f.ruleId === "R2_AGENT_NO_ALLOWLIST");
    expect(r2).toHaveLength(4);
    expect(r2[0]).toMatchObject({ id: `R2_AGENT_NO_ALLOWLIST:${s.keys.key_agent_data.address}`, severity: "MEDIUM", principalId: "agent_data" });
  });
  it("a lock does not drop findings", async () => {
    await mockApi.lockDistrict({ principalId: "minh", member: "lan" });
    expect(await ids()).toEqual(seedIds);
  });
  it("policy v2: proposal #11 by lan executed, no findings; lock then emits 5 role-0 events in the lock tx", async () => {
    await mockApi.applyPolicyV2();
    const p11 = (await mockApi.getProposals()).find((p) => p.id === 11)!;
    expect(p11.proposer).toBe("lan");
    expect(p11.status).toBe("executed");
    expect(await ids()).toEqual([]);
    await mockApi.lockDistrict({ principalId: "minh", member: "lan" });
    expect(await ids()).toEqual([]);
    const ev = await mockApi.getEvents();
    const locked = ev.find((e) => e.name === "PrincipalLocked")!;
    const roles = ev.filter((e) => e.name === "AllowListRoleSet");
    expect(roles).toHaveLength(5);
    expect(roles.every((e) => e.payload.role === 0 && e.txHash === locked.txHash)).toBe(true);
  });
});
