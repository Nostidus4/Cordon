import { describe, expect, it } from "vitest";
import type { ChainEvent } from "../../types";
import { contractOf, countBy, filterEvents, lastBlock, summarize } from "./eventLog";

const ev = (id: string, name: string, block: number, payload: Record<string, unknown> = {}, logIndex = 0): ChainEvent =>
  ({ id, chain: "l1", block, txHash: `0x${id.padEnd(64, "a")}`, simulated: true, logIndex, name, payload, ts: "2026-11-11T00:00:00Z" });
const none = { contracts: new Set<never>(), names: new Set<string>(), q: "" };

describe("eventLog", () => {
  it("maps events to the contract that emits them", () => {
    expect(contractOf("Paid")).toBe("PolicyVault");
    expect(contractOf("KeyMoved")).toBe("PrincipalRegistry");
    expect(contractOf("Proposed")).toBe("GuardianCouncil");
    expect(contractOf("RoleSet")).toBe("TxAllowList");
    expect(contractOf("AllowListRoleSet")).toBe("TxAllowList");
    expect(contractOf("Weird")).toBe("other");
  });
  it("summarises payload with Money display and counts arrays", () => {
    const e = ev("1", "PrincipalLocked", 5, { principalId: "p1", by: "lan", keysRemoved: ["a", "b", "c", "d"] });
    expect(summarize(e)).toEqual([["principalId", "p1"], ["by", "lan"], ["keysRemoved", "4 mục"]]);
    const p = ev("2", "Paid", 6, { key: "key_x", amount: { raw: "1", display: "30.000" }, principalSpentAfter: { raw: "2", display: "5.000" } });
    expect(summarize(p).map(([k, v]) => `${k}=${v}`)).toEqual(["key=key_x", "amount=30.000", "principalSpentAfter=5.000"]);
  });
  it("sorts newest first and filters by contract, name and search", () => {
    const list = [ev("a", "Paid", 3, { key: "key_minh" }), ev("b", "Proposed", 4), ev("c", "Swapped", 5, { key: "key_agent" }), ev("d", "Executed", 5, {}, 1)];
    expect(filterEvents(list, none).map((e) => e.id)).toEqual(["d", "c", "b", "a"]);
    expect(filterEvents(list, { ...none, contracts: new Set(["GuardianCouncil"]) }).map((e) => e.id)).toEqual(["d", "b"]);
    expect(filterEvents(list, { ...none, names: new Set(["Paid"]) }).map((e) => e.id)).toEqual(["a"]);
    expect(filterEvents(list, { ...none, q: "KEY_AGENT" }).map((e) => e.id)).toEqual(["c"]);
    expect(filterEvents(list, { ...none, q: "0xb" }).map((e) => e.id)).toEqual(["b"]);
  });
  it("last block and counts", () => {
    expect(lastBlock([])).toBeNull();
    expect(lastBlock([ev("a", "Paid", 3), ev("b", "Paid", 9)])).toBe(9);
    expect(countBy([ev("a", "Paid", 1), ev("b", "Paid", 1), ev("c", "Swapped", 1)], (e) => e.name)).toEqual([["Paid", 2], ["Swapped", 1]]);
  });
});
