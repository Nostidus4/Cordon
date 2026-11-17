import { describe, expect, it } from "vitest";
import { councilEventKeys } from "./useStream";
import { qk } from "./queryKeys";

describe("councilEventKeys", () => {
  it("refetches proposals for votes made outside the backend", () => {
    for (const n of ["Approved", "Queued", "Vetoed", "Cancelled"]) expect(councilEventKeys(n)).toContainEqual(qk.proposals);
  });
  it("also redraws graph, districts and city on Executed", () => {
    const keys = councilEventKeys("Executed");
    expect(keys).toContainEqual(qk.proposals);
    expect(keys).toContainEqual(qk.graph);
    expect(keys).toContainEqual(["district"]);
    expect(keys).toContainEqual(qk.city);
  });
  it("ignores other events", () => {
    expect(councilEventKeys("Paid")).toEqual([]);
  });
});
