// Council timelock in the mock (#77), same rules as chain/sim: 2/3 -> Queued (eta = now + delay), executes by itself at eta, a member may veto meanwhile.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOCK_TIMELOCK_S, mockApi, mockConfig } from "./server";

mockConfig.latencyMs = 0;
mockConfig.stepDelayMs = 0;

const FID = "R1_MULTI_KEY_NO_SHARED_CAP:minh";
async function queued() {
  await mockApi.resetDemo();
  const p = await mockApi.createProposal({ member: "lan", findingId: FID });
  await mockApi.approveProposal(p.id, "lan");
  return { id: p.id, afterTrang: await mockApi.approveProposal(p.id, "trang") };
}

describe("mock Council timelock", () => {
  beforeEach(() => { vi.useFakeTimers(); mockConfig.timelockS = MOCK_TIMELOCK_S; });
  afterEach(() => { vi.useRealTimers(); mockConfig.timelockS = 0; });

  it("demo default is 15 s, like the Guardian L1", () => { expect(MOCK_TIMELOCK_S).toBe(15); });

  it("2/3 queues the proposal; the keeper executes it at eta", async () => {
    const { id, afterTrang } = await queued();
    const now = Math.floor(Date.now() / 1000);
    expect(afterTrang).toMatchObject({ status: "open", queued: true });
    expect(afterTrang.eta).toBe(now + 15);
    expect((await mockApi.getGraph()).policyVersion).toBe(1);
    expect((await mockApi.getEvents()).map((e) => e.name)).toContain("Queued");
    await vi.advanceTimersByTimeAsync(14_000);
    expect((await mockApi.getProposals()).find((p) => p.id === id)).toMatchObject({ status: "open", queued: true });
    await vi.advanceTimersByTimeAsync(1_500);
    const done = (await mockApi.getProposals()).find((p) => p.id === id)!;
    expect(done).toMatchObject({ status: "executed", queued: false });
    expect((await mockApi.getGraph()).policyVersion).toBe(2);
  });

  it("execute before eta is 409 TIMELOCK_NOT_READY", async () => {
    const { id } = await queued();
    await expect(mockApi.executeProposal(id, "lan")).rejects.toMatchObject({ code: "TIMELOCK_NOT_READY" });
    vi.setSystemTime(Date.now() + 15_000);
    expect(await mockApi.executeProposal(id, "lan")).toMatchObject({ status: "executed" });
  });

  it("execute below the threshold is NEEDS_THRESHOLD", async () => {
    await mockApi.resetDemo();
    const p = await mockApi.createProposal({ member: "lan", findingId: FID });
    await expect(mockApi.executeProposal(p.id, "lan")).rejects.toMatchObject({ code: "NEEDS_THRESHOLD" });
  });

  it("one member can veto while queued; nothing executes afterwards", async () => {
    const { id } = await queued();
    const v = await mockApi.vetoProposal(id, "huy");
    expect(v).toMatchObject({ status: "cancelled", queued: false, vetoedBy: "huy" });
    await vi.advanceTimersByTimeAsync(20_000);
    expect((await mockApi.getGraph()).policyVersion).toBe(1);
    expect((await mockApi.getEvents()).map((e) => e.name)).toEqual(expect.arrayContaining(["Cancelled", "Vetoed"]));
    await expect(mockApi.vetoProposal(id, "huy")).rejects.toMatchObject({ code: "PROPOSAL_NOT_OPEN" });
  });

  it("applyPolicyV2 is a setup step: Queued is emitted but there is no wait", async () => {
    await mockApi.resetDemo();
    await mockApi.applyPolicyV2();
    expect((await mockApi.getGraph()).policyVersion).toBe(2);
    expect((await mockApi.getEvents()).map((e) => e.name)).toContain("Queued");
  });
});

describe("assistant: give the rebalance agent to Huy", () => {
  it("states the estimated exposure (before != after) and matches the backend wording", async () => {
    await mockApi.resetDemo();
    const a = await mockApi.askAssistant({ question: "Có nên giao trợ lý Cân đối cho anh Huy?" });
    expect(a.answer).toContain("có thể chi tới 60.000 USDC/ngày (hiện 40.000)");
    expect(a.numbers.map((n) => n.value)).toEqual(["60.000", "40.000", "100.000"]);
    expect(a.numbersVerified).toBe(true);
  });
});
