import { describe, expect, it } from "vitest";
import { policyLabel } from "./policy";

describe("policyLabel", () => {
  it("prefers the backend label (a real chain counts the seed proposals)", () => {
    expect(policyLabel({ policyVersion: 4, policyLabel: 1 })).toBe(1);
    expect(policyLabel({ policyVersion: 5, policyLabel: 2 })).toBe(2);
  });
  it("falls back to the raw version (mock, older backends) and tolerates no data", () => {
    expect(policyLabel({ policyVersion: 2 })).toBe(2);
    expect(policyLabel(undefined)).toBeUndefined();
  });
});
