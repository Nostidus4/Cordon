import { describe, expect, it } from "vitest";
import { approvalSummary, callSymbol, conflictCheck, emergencyActions } from "./council.logic";
import type { ChainEvent } from "../../types";

describe("callSymbol", () => {
  it("renders raw positional args", () => {
    expect(callSymbol({ target: "PolicyVault", fn: "setPrincipalDailyCap", args: { principalId: "minh", cap: { raw: "30000000000", display: "30.000" } } })).toBe("PolicyVault.setPrincipalDailyCap(minh, 30.000)");
    expect(callSymbol({ target: "PolicyVault", fn: "bumpPolicyVersion", args: {} })).toBe("PolicyVault.bumpPolicyVersion()");
  });
});
describe("approvalSummary", () => {
  const members = [{ id: "trang" as const }, { id: "lan" as const }, { id: "huy" as const }];
  it("counts distinct approvers against the threshold", () => {
    const s = approvalSummary({ approvals: ["lan", "trang"], threshold: 2, conflictedMembers: [] }, members);
    expect(s).toMatchObject({ approved: 2, need: 2, eligible: 3, reached: true, stuck: false });
  });
  it("is stuck when too many members are conflicted", () => {
    const s = approvalSummary({ approvals: [], threshold: 2, conflictedMembers: ["lan", "huy"] }, members);
    expect(s).toMatchObject({ eligible: 1, reached: false, stuck: true });
  });
});
describe("conflictCheck", () => {
  it("flags the owner of the subject district", () => {
    const c = conflictCheck({ id: "huy", principalId: "huy" }, { conflictedMembers: ["huy"], subjectPrincipal: "huy" });
    expect(c.conflict).toBe(true);
    expect(c.reason).toContain("huy");
  });
  it("passes others with a reason", () => {
    expect(conflictCheck({ id: "lan", principalId: null }, { conflictedMembers: ["huy"], subjectPrincipal: "huy" })).toEqual({ conflict: false, reason: "không sở hữu khu nào" });
    expect(conflictCheck({ id: "trang", principalId: "trang" }, { conflictedMembers: [], subjectPrincipal: "minh" }).reason).toBe("chủ khu trang khác minh");
  });
});
describe("emergencyActions", () => {
  const ev = (id: string, ts: number, name: string, payload: Record<string, unknown>): ChainEvent => ({ block: 1, txHash: "0x" + id, simulated: true, logIndex: 0, name, payload, ts });
  it("keeps only EmergencyAction, newest first, with VI labels", () => {
    const r = emergencyActions([
      ev("a", 1, "EmergencyAction", { member: "lan", action: "lockPrincipal", subject: "minh" }),
      ev("b", 2, "PrincipalLocked", {}),
      ev("c", 3, "EmergencyAction", { member: "trang", action: "pauseAll" }),
    ]);
    expect(r.map((x) => x.id)).toEqual(["0xc:0", "0xa:0"]);
    expect(r.map((x) => x.label)).toEqual(["Dừng cả kho", "Khoá khu minh"]);
  });
});
