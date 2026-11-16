import { describe, expect, it } from "vitest";
import type { ChainEvent, CouncilMember, Proposal } from "../../types";
import { buildHistory } from "./councilHistory";

// Payload names follow docs/spec/API_CONTRACT.md §2: Proposed {id, proposer(address)}, Approved {id, member(address)}, Executed {id}.
const A = { trang: "0x1342B9A27b1752Cd8cA9d893f0A1003315D0A8e8", lan: "0xB3A84cD8AA6FAF7F24C3BE62E4c2A8bbec0438F4", huy: "0x4c75D2F66763Fb0ea7635028882028Ed395c2744" };
const members: CouncilMember[] = [
  { id: "trang", label: "Chị Trang", address: A.trang, principalId: null },
  { id: "lan", label: "Chị Lan", address: A.lan, principalId: "lan" },
  { id: "huy", label: "Anh Huy", address: A.huy, principalId: "huy" },
];
let n = 0;
const ev = (name: string, payload: Record<string, unknown>, txHash = `0x${++n}`): ChainEvent => ({ block: n, txHash, simulated: true, logIndex: 0, name, payload, ts: 1_794_000_000 + n });

describe("buildHistory with live payloads", () => {
  it("resolves addresses to member labels and reads `id`", () => {
    const h = buildHistory([
      ev("Proposed", { id: 14, proposer: A.lan, subjectPrincipal: "minh", title: "Gộp khu", riskReportHash: "0xabc" }),
      ev("Approved", { id: 14, member: A.lan }),
      ev("Approved", { id: 14, member: A.trang }),
      ev("PolicyVersionBumped", { version: 2 }),
      ev("Executed", { id: 14 }),
      ev("PrincipalLocked", { principalId: "minh", by: A.lan }),
      ev("EmergencyAction", { member: A.lan, action: "lockPrincipal", subject: "minh" }, "0xe"),
    ], members).reverse();
    expect(h.map((x) => x.title)).toEqual(["Chị Lan đề xuất #14", "Chị Lan duyệt #14", "Chị Trang duyệt #14", "Đề xuất #14 được thực thi", "Chị Lan khoá khu anh Minh", "Chị Lan khoá khu anh Minh"]);
    expect(h[2].rule).toBe("phiếu 2/2");
    expect(h[3]).toMatchObject({ kind: "loosen", detail: "Gộp khu", policyVersion: 2 });
  });

  it("takes approval time and resulting policy version from the proposal", () => {
    const prop = { id: 14, resultingPolicyVersion: 7, members: [{ id: "lan", approvedAt: 1_800_000_000 }] } as unknown as Proposal;
    const h = buildHistory([ev("Approved", { id: 14, member: A.lan }), ev("PolicyVersionBumped", { version: 9 }), ev("Executed", { id: 14 })], members, 0, [prop]).reverse();
    expect(h[0].ts).toBe(new Date(1_800_000_000 * 1000).toISOString());
    expect(h[1].policyVersion).toBe(7);
  });
});
