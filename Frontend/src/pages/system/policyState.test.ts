import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "../../types";
import { decimalsOf, parseProtocol, policySnapshot } from "./policyState";

const m = (raw: string) => ({ raw, display: raw });
const graph = (locked: boolean, active: boolean): GraphSnapshot => ({
  version: 1, policyVersion: 2, block: 9,
  nodes: [{ id: "vault", type: "Vault", label: "v", data: { paused: false } }, { id: "k:key_a", type: "Key", label: "a", data: { active, keyDailyCap: m("10"), keySpentToday: m("3") } }, { id: "t:tUSDC", type: "Token", label: "tUSDC", data: {} }],
  edges: [], districts: [{ principalId: "p", label: "P", kind: "AGENT", dailyCap: null, spentToday: m("3"), locked, keys: ["key_a"] }],
});
describe("policyState", () => {
  it("decimals and protocol parsing", () => {
    expect(decimalsOf("tTKB")).toBe(18); expect(decimalsOf("zzz")).toBeNull();
    expect(parseProtocol("MockDEX.swapExactIn")).toEqual({ target: "MockDEX", fn: "swapExactIn" });
  });
  it("snapshot changes on lock so useChanged can flash", () => {
    const a = policySnapshot(graph(false, true)), b = policySnapshot(graph(true, false));
    expect(a["d:p:cap"]).toBe("none");
    expect(a["d:p:locked"]).toBe("false"); expect(b["d:p:locked"]).toBe("true");
    expect(a["k:key_a:role"]).toBe("true"); expect(b["k:key_a:role"]).toBe("false");
    expect(a["policy"]).toBe("2");
  });
});
