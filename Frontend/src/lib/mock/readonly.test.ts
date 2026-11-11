// Read-only additions for the system dashboard: agent runs list, assistant logs (+ §9.4 number verification), health uptime.
import { beforeEach, describe, expect, it } from "vitest";
import { mockApi, mockConfig } from "./server";
import { numbersInText, readPath, renderValue, verifyAnswer } from "./assistantVerify";
import { ASSISTANT_QUESTIONS } from "../../shared/assistantQuestions";

mockConfig.latencyMs = 0;
mockConfig.stepDelayMs = 0;
beforeEach(async () => { await mockApi.resetDemo(); });

describe("getAgentRuns", () => {
  it("is empty after reset and lists each run with its rule-engine inputs", async () => {
    expect(await mockApi.getAgentRuns()).toEqual([]);
    const run = await mockApi.runAgentOnce();
    const list = await mockApi.getAgentRuns();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(run.id);
    expect(list[0].inputs?.vaultUsdc.display).toBe("200.000");
    expect(list[0].inputs?.vaultTkb.display).toBe("0");
    expect(list[0].inputs?.maxPerRun.display).toBe("5.000");
    expect(list[0].decision.amountIn?.display).toBe("5.000");
  });
});

describe("getAssistantLogs", () => {
  it("records tool calls and verifies numbers against the tool values", async () => {
    expect(await mockApi.getAssistantLogs()).toEqual([]);
    for (const q of ASSISTANT_QUESTIONS) await mockApi.askAssistant({ question: q.text, context: { screen: q.screen } });
    const logs = await mockApi.getAssistantLogs();
    expect(logs).toHaveLength(4);
    const huy = logs[0];
    expect(huy.toolCalls[0].tool).toBe("simulate_compromise");
    expect(huy.checks.map((c) => [c.value, c.toolValue, c.match])).toEqual([["140.000", "140.000", true], ["7%", "7", true]]);
    for (const l of logs) expect(l.checks.every((c) => c.match)).toBe(true);
    // §9.4: every number in every fixed answer must be listed in numbers[] (wording matches the backend template)
    expect(logs.map((l) => l.uncovered)).toEqual([[], [], [], []]);
    expect(logs.map((l) => l.numbersVerified)).toEqual([true, true, true, true]);
  });
  it("is cleared by reset", async () => {
    await mockApi.askAssistant({ question: ASSISTANT_QUESTIONS[0].text, context: { screen: "simulate" } });
    await mockApi.resetDemo();
    expect(await mockApi.getAssistantLogs()).toEqual([]);
  });
});

describe("verifyAnswer (§9.4)", () => {
  it("flags numbers in the answer that are not in numbers[] and values that differ from the tool", () => {
    const ans = { answer: "Mất 140.000 trong 3 khu.", numbers: [{ label: "x", value: "140.000", source: "simulate" as const, path: "totals.estimated.display" }], highlight: { nodeIds: [], edgeIds: [] } };
    const r = verifyAnswer(ans, { simulate: { totals: { estimated: { raw: "1", display: "150.000" } } } });
    expect(r.checks[0].match).toBe(false);
    expect(r.uncovered).toEqual(["3"]);
    expect(r.verified).toBe(false);
  });
  it("helpers", () => {
    expect(numbersInText("khoảng 6,5% quỹ, 140.000/ngày")).toEqual(["6,5", "140.000"]);
    expect(readPath({ calls: [{ fn: "setPrincipalDailyCap", args: { cap: "30000000000" } }] }, "calls[setPrincipalDailyCap].args.cap")).toBe("30000000000");
    expect(renderValue("30000000000")).toBe("30.000");
    expect(renderValue(6.5)).toBe("6,5");
  });
});

describe("health.uptimeSec", () => {
  it("is a non-negative integer", async () => {
    const h = await mockApi.getHealth();
    expect(Number.isInteger(h.uptimeSec)).toBe(true);
    expect(h.uptimeSec).toBeGreaterThanOrEqual(0);
  });
});

describe("proposals are frozen at creation (spec §6.5)", () => {
  it("locking minh afterwards does not change the stored risk report or hash of #12 / #13", async () => {
    await mockApi.applyPolicyV2();
    const before = await mockApi.getProposals();
    const p12 = before.find((p) => p.id === 12)!, p13 = before.find((p) => p.id === 13)!;
    expect([p12.riskReport.before.enforced.display, p12.riskReport.after.enforced.display]).toEqual(["30.000", "130.000"]);
    expect([p12.riskReport.before.percentOfMainTreasury, p12.riskReport.after.percentOfMainTreasury]).toEqual([1.5, 6.5]);
    expect([p13.riskReport.before.enforced.display, p13.riskReport.after.enforced.display]).toEqual(["40.000", "60.000"]);
    await mockApi.lockDistrict({ principalId: "minh", member: "lan" });
    const after = await mockApi.getProposals();
    for (const old of [p12, p13]) {
      const now = after.find((p) => p.id === old.id)!;
      expect(now.riskReport).toEqual(old.riskReport);
      expect(now.riskReportHash).toBe(old.riskReportHash);
      expect(now.calls).toEqual(old.calls);
      expect(now.conflictedMembers).toEqual(old.conflictedMembers);
    }
  });
});
