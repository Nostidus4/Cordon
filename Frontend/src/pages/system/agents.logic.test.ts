import { describe, expect, it } from "vitest";
import { bindKey, buildRoster, countBySource, filterViolations, hashState, incidentRows, nowStrip, sortRunsNewest, stepRows, visibleCount, RECENT_SEC } from "./agents.logic";
import type { AgentRun, GraphSnapshot, Incident, Violation } from "../../types";

const graph = {
  version: 1, policyVersion: 1, policyLabel: 1, block: 1, edges: [],
  nodes: [{ id: "k:key_agent_rebalance", type: "Key", label: "Trợ lý Cân đối", data: { principalId: "agent_rebalance" } }],
  districts: [{ principalId: "agent_rebalance", label: "Khu Cân đối", kind: "AGENT", dailyCap: null, spentToday: { raw: "0", display: "0" }, locked: false, keys: ["key_agent_rebalance"] }],
} as unknown as GraphSnapshot;

const run = (o: Partial<AgentRun> = {}): AgentRun => ({
  id: 1, ts: 1000, outcome: "swapped", decision: null, reasonText: null, reasonSource: null, reasonHash: null, txHash: null, reasonCode: null, attemptId: null,
  balances: {} as AgentRun["balances"], steps: null, untrustedInput: null, injectionIgnored: null, reasonHashOnChain: null, reasonHashVerified: null, rejectedReasonText: null, ...o,
});
const viol = (o: Partial<Violation>): Violation => ({ id: 1, ts: 1000, source: "attacker", key: "key_agent_intl_pay", keyLabel: "k", principalId: null, district: null, action: "pay", reasonCode: "RECIPIENT_NOT_ALLOWED", txHash: null, simulated: true, ref: "attempt:1", ...o });
const inc = (o: Partial<Incident>): Incident => ({ id: 1, building: "B05" as Incident["building"], faultId: null, titleVi: "t", status: "contained", openedAt: 500, resolvedAt: null, subject: {}, trigger: {}, steps: [], proposalId: null, ...o });

describe("bindKey", () => {
  it("joins key id with node label and district", () => {
    expect(bindKey(graph, "key_agent_rebalance")).toEqual({ keyId: "key_agent_rebalance", keyLabel: "Trợ lý Cân đối", principalId: "agent_rebalance", district: "Khu Cân đối" });
  });
  it("falls back to the raw id when the graph has no such key", () => {
    expect(bindKey(undefined, "key_x")).toEqual({ keyId: "key_x", keyLabel: "key_x", principalId: null, district: null });
  });
});

describe("buildRoster", () => {
  const base = { graph, now: 1000 + RECENT_SEC - 1 };
  it("has the seven agents, attacker flagged as scripted, read-only ones without a key", () => {
    const cards = buildRoster({ ...base, runs: [run()], payrollRuns: [], incidents: [], violations: [], drafts: [], checks: [] });
    expect(cards.map((c) => c.id)).toEqual(["rebalance", "payroll", "assistant", "copilot", "responder", "txguard", "attacker"]);
    expect(cards.find((c) => c.id === "attacker")!.scripted).toBe(true);
    expect(cards.find((c) => c.id === "assistant")!.bindings).toEqual([]);
    expect(cards.find((c) => c.id === "txguard")!.bindings).toEqual([]);
    expect(cards[0].bindings[0].district).toBe("Khu Cân đối");
  });
  it("rebalance: recent then idle, never when no runs", () => {
    expect(buildRoster({ ...base, runs: [run()] })[0].status.kind).toBe("recent");
    expect(buildRoster({ ...base, now: 1000 + RECENT_SEC + 1, runs: [run()] })[0].status.kind).toBe("idle");
    expect(buildRoster({ ...base, runs: [] })[0].status.kind).toBe("never");
    expect(buildRoster({ ...base, runs: [run({ outcome: "blocked" })] })[0].outcome).toEqual({ tone: "bad", label: "bị chặn" });
  });
  it("payroll is unavailable when its data did not load", () => {
    expect(buildRoster({ ...base }).find((c) => c.id === "payroll")!.status.kind).toBe("unavailable");
  });
  it("responder is busy with an open incident; attacker lists borrowed keys", () => {
    const cards = buildRoster({ ...base, incidents: [inc({})], violations: [viol({}), viol({ id: 2, key: "key_agent_rebalance" })] });
    expect(cards.find((c) => c.id === "responder")!.status.kind).toBe("busy");
    expect(cards.find((c) => c.id === "attacker")!.bindings.map((b) => b.keyId).sort()).toEqual(["key_agent_intl_pay", "key_agent_rebalance"]);
  });
});

describe("run helpers", () => {
  it("sorts newest first and pages by 5", () => {
    expect(sortRunsNewest([run({ id: 1, ts: 1 }), run({ id: 2, ts: 3 }), run({ id: 3, ts: 2 })]).map((r) => r.id)).toEqual([2, 3, 1]);
    expect(visibleCount(12, 1)).toBe(5);
    expect(visibleCount(12, 3)).toBe(12);
    expect(visibleCount(0, 1)).toBe(0);
  });
  it("maps steps and hash state", () => {
    const r = run({ steps: [{ key: "read", labelVi: "Đọc", status: "ok", detail: {} }, { key: "simulate", labelVi: "Chạy thử", status: "blocked", detail: {} }, { key: "send", labelVi: "Gửi", status: "skipped", detail: {} }] });
    expect(stepRows(r).map((s) => s.tone)).toEqual(["ok", "bad", "grey"]);
    expect(hashState({ reasonHashVerified: null })).toBe("none");
    expect(hashState({ reasonHashVerified: true })).toBe("match");
    expect(hashState({ reasonHashVerified: false })).toBe("mismatch");
  });
});

describe("violations and strip", () => {
  const list = [viol({ id: 1 }), viol({ id: 2, source: "agent", ts: 2000 }), viol({ id: 3, source: "copilot" })];
  it("filters and counts by source", () => {
    expect(filterViolations(list, "agent")).toHaveLength(1);
    expect(filterViolations(list, "all")).toHaveLength(3);
    expect(countBySource(list)).toMatchObject({ all: 3, agent: 1, attacker: 1, copilot: 1, fault: 0 });
  });
  it("nowStrip picks the newest run, open incident and attacker attempt", () => {
    const n = nowStrip({ runs: [run({ id: 1, ts: 1 }), run({ id: 2, ts: 9 })], incidents: [inc({ id: 1, status: "resolved" }), inc({ id: 2 })], violations: list });
    expect(n.lastRun!.id).toBe(2);
    expect(n.openIncident!.id).toBe(2);
    expect(n.lastAttacker!.id).toBe(1);
    expect(nowStrip({})).toEqual({ lastRun: null, openIncident: null, lastAttacker: null });
  });
  it("maps incident steps", () => {
    const rows = incidentRows(inc({ steps: [{ key: "detect", labelVi: "Phát hiện", status: "done", ts: 5, detailVi: "x", txHash: null }] }));
    expect(rows[0]).toMatchObject({ key: "detect", tone: "done", ts: 5 });
  });
});
