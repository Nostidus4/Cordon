import { describe, expect, it } from "vitest";
import type { AgentRun, CityStates, FaultDef, Incident } from "../types";
import { MOCK_FAULTS, buildAgentSteps, newIncidentSteps, ruleForState } from "./mock/ops";
import {
  actionOutcomeVi, awaitsCouncil, buildingStatesFrom, currentStep, faultsOfBuilding, incidentShot, latestRunWithSteps, pickTrackedIncident, reasonTextVi, shortHash, stepViews,
} from "./ops";

const inc = (over: Partial<Incident> = {}): Incident => ({
  id: 1, building: "B05", faultId: "F05_KEY_LEAK", titleVi: "x", status: "awaiting_council", openedAt: 0, resolvedAt: null, subject: {}, trigger: {}, proposalId: 13, steps: newIncidentSteps(), ...over,
});

describe("faults per building", () => {
  it("lists only the faults of that building", () => {
    expect(faultsOfBuilding(MOCK_FAULTS, "B06").map((f) => f.id)).toEqual(["F06_AGENT_INJECTION", "F07_AGENT_CAP"]);
    expect(faultsOfBuilding(MOCK_FAULTS, "B05").map((f) => f.id)).toEqual(["F05_KEY_LEAK"]);
    expect(faultsOfBuilding(MOCK_FAULTS, "B08")).toEqual([]);
    const f: FaultDef[] = [{ id: "A", building: "B01", titleVi: "", whatVi: "", expectVi: "" }];
    expect(faultsOfBuilding(f, "B02")).toEqual([]);
  });
  it("covers F01..F07 exactly once with the spec buildings", () => {
    expect(MOCK_FAULTS.map((f) => `${f.id.slice(0, 3)}:${f.building}`)).toEqual(["F01:B01", "F02:B02", "F03:B03", "F04:B04", "F05:B05", "F06:B06", "F07:B06"]);
  });
});

describe("incident view", () => {
  it("maps steps to numbered views and picks the current step", () => {
    const i = inc();
    i.steps[0].status = "done"; i.steps[0].detailVi = "a";
    i.steps[1].status = "done"; i.steps[1].detailVi = "Khoá khu"; i.steps[1].txHash = "0x" + "a".repeat(64);
    i.steps[2].status = "active"; i.steps[2].detailVi = "Đề xuất #13";
    expect(stepViews(i).map((s) => `${s.index}:${s.key}:${s.tone}`)).toEqual(["0:detect:done", "1:contain:done", "2:propose:active", "3:recover:pending", "4:verify:pending"]);
    expect(currentStep(i)?.key).toBe("propose");
    i.steps[2].status = "skipped"; i.steps[3].status = "skipped";
    expect(currentStep(i)?.key).toBe("contain");
    expect(currentStep(inc({ steps: newIncidentSteps() }))).toBeNull();
  });
  it("tracks the newest open incident only", () => {
    expect(pickTrackedIncident(undefined)).toBeNull();
    expect(pickTrackedIncident([inc({ id: 3, status: "resolved" }), inc({ id: 2 }), inc({ id: 1 })])?.id).toBe(2);
    expect(pickTrackedIncident([inc({ id: 3, status: "resolved" })])).toBeNull();
  });
  it("offers the Council buttons only while awaiting_council with a proposal", () => {
    expect(awaitsCouncil(inc())).toBe(true);
    expect(awaitsCouncil(inc({ status: "contained" }))).toBe(false);
    expect(awaitsCouncil(inc({ proposalId: null }))).toBe(false);
    expect(awaitsCouncil(null)).toBe(false);
  });
  it("frames the affected building with the existing { building } shot", () => {
    expect(incidentShot({ building: "B05" })).toEqual({ building: "B05" });
  });
});

describe("texts", () => {
  it("shortens hashes and explains reason codes, including contract-only ones", () => {
    expect(shortHash("0x" + "ab".repeat(32))).toBe("0xababab…abab");
    expect(shortHash("0x12")).toBe("0x12");
    expect(reasonTextVi("RECIPIENT_NOT_ALLOWED")).toBe("Người nhận chưa duyệt");
    expect(reasonTextVi("CONFLICT_OF_INTEREST")).toContain("Xung đột");
    expect(reasonTextVi("WHATEVER")).toBe("Bị chặn");
    expect(reasonTextVi(null)).toBe("");
    expect(actionOutcomeVi({ labelVi: "", ok: true, txHash: null, simulated: true, reasonCode: null })).toBe("Đã chạy xong");
    expect(actionOutcomeVi({ labelVi: "", ok: false, txHash: null, simulated: true, reasonCode: "DISTRICT_DAILY_CAP" })).toBe("Bị chặn: Cả khu hôm nay đã gần hết phần chung");
  });
});

describe("city states and rules", () => {
  it("derives buildingStates from the city states", () => {
    expect(buildingStatesFrom(undefined)).toBeUndefined();
    const c = { B01: { state: "warning", reasonVi: "" }, B02: { state: "normal", reasonVi: "" } } as unknown as CityStates;
    expect(buildingStatesFrom(c)).toEqual({ B01: "warning", B02: "normal" });
  });
  it("picks the rule that paints a building", () => {
    expect(ruleForState("B03", "normal")).toBeNull();
    expect(ruleForState("B03", "incident")).toBe("B03.paused");
    expect(ruleForState("B03", "warning")).toBe("B03.near_cap");
    expect(ruleForState("B05", "recovery", "open")).toBe("B05.incident_open");
    expect(ruleForState("B05", "recovery", "recovering")).toBe("B05.incident_recovering");
    expect(ruleForState("B08", "incident")).toBe("B08.worst");
  });
});

describe("agent timeline", () => {
  const base = { decision: { tokenIn: "tUSDC", tokenOut: "tTKB", amountIn: { raw: "1", display: "1" }, gap: { raw: "1", display: "1" }, ttkbWeightBps: 500, targetBps: 2000, totalValue: { raw: "1", display: "1" } },
    balances: { vaultTusdc: { raw: "1", display: "1" }, vaultTtkb: { raw: "0", display: "0" }, ttkbValueInTusdc: { raw: "0", display: "0" }, keyRemaining: { raw: "1", display: "1" }, districtRemaining: null }, reasonText: "r", reasonSource: "template" as const, reasonHash: null };
  it("has read, decide, simulate, send, explain with blocked/skipped marks", () => {
    const ok = buildAgentSteps({ ...base, outcome: "swapped", txHash: "0x1", reasonCode: null });
    expect(ok.map((s) => `${s.key}:${s.status}`)).toEqual(["read:ok", "decide:ok", "simulate:ok", "send:ok", "explain:ok"]);
    const blocked = buildAgentSteps({ ...base, outcome: "blocked", txHash: null, reasonCode: "CARD_DAILY_CAP" });
    expect(blocked.map((s) => s.status)).toEqual(["ok", "ok", "blocked", "skipped", "ok"]);
    const noop = buildAgentSteps({ ...base, outcome: "no_action", txHash: null, reasonCode: null });
    expect(noop.map((s) => s.status)).toEqual(["ok", "ok", "skipped", "skipped", "ok"]);
  });
  it("finds the latest run that carries steps", () => {
    const withSteps = { id: 2, steps: buildAgentSteps({ ...base, outcome: "no_action", txHash: null, reasonCode: null }) } as AgentRun;
    expect(latestRunWithSteps([withSteps, { id: 3 } as AgentRun])?.id).toBe(2);
    expect(latestRunWithSteps([{ id: 3 } as AgentRun])).toBeNull();
    expect(latestRunWithSteps(undefined)).toBeNull();
  });
});
