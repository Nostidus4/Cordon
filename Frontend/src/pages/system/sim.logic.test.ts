import { describe, expect, it } from "vitest";
import { REFERENCE, changeCapOf, matchReference, presetsFrom } from "./sim.logic";
import { money, toBase } from "../../lib/format";
import type { SimResult } from "../../types";

const res = (y: number, e: number, s: number): SimResult => ({
  reachedKeys: [], perDistrict: [], highlights: { nodeIds: [], edgeIds: [] }, findings: [],
  totals: { youThink: money(toBase(y)), enforced: money(toBase(e)), estimated: money(toBase(s)), vaultBalance: money(toBase(1)), percentOfMainTreasury: 0 },
});

describe("reference table (spec §8.4)", () => {
  it("has the four mandatory rows", () => {
    expect(REFERENCE.map((r) => [r.youThink, r.enforced, r.estimated])).toEqual([[20000, 20000, 100000], [60000, 60000, 140000], [30000, 30000, 30000], [130000, 130000, 130000]]);
  });
  it("matches only the row of the viewed scenario", () => {
    const ctx = { policyVersion: 1, compromised: ["minh"] };
    expect(REFERENCE.map((r) => matchReference(r, ctx, res(20000, 20000, 100000)))).toEqual(["match", "other", "other", "other"]);
  });
  it("flags numbers that differ for the same scenario", () => {
    expect(matchReference(REFERENCE[0], { policyVersion: 1, compromised: ["minh"] }, res(20000, 20000, 99000))).toBe("mismatch");
  });
  it("matches v2 + #12 through the raise_cap change", () => {
    const change = { kind: "raise_cap" as const, principalId: "minh", newCapRaw: toBase(130000).toString() };
    expect(changeCapOf(change)).toBe(130000);
    expect(REFERENCE.map((r) => matchReference(r, { policyVersion: 2, compromised: ["minh"], change }, res(130000, 130000, 130000)))).toEqual(["other", "other", "other", "match"]);
  });
  it("does not apply once the district spent or is locked", () => {
    expect(matchReference(REFERENCE[0], { policyVersion: 1, compromised: ["minh"], pristine: false }, res(0, 0, 0))).toBe("other");
  });
  it("returns other without a result", () => { expect(matchReference(REFERENCE[0], { policyVersion: 1, compromised: ["minh"] }, undefined)).toBe("other"); });
});
describe("presetsFrom", () => {
  it("keeps open proposals only", () => {
    const change = { kind: "raise_cap" as const, principalId: "minh", newCapRaw: "1" };
    expect(presetsFrom([{ id: 12, status: "open", title: "t", change }, { id: 11, status: "executed", title: "x", change }]).map((p) => p.id)).toEqual(["p12"]);
    expect(presetsFrom(undefined)).toEqual([]);
  });
});
