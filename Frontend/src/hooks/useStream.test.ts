import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { applyReset, councilEventKeys } from "./useStream";
import { useUiStore } from "../store/uiStore";
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

describe("applyReset", () => {
  it("empties cached attempts/runs and the selected replay run", () => {
    const qc = new QueryClient();
    qc.setQueryData(qk.attempts(), [{ id: 1 }]);
    qc.setQueryData(qk.attempts("run-1"), [{ id: 1 }]);
    qc.setQueryData(qk.runs, [{ id: "run-1" }]);
    useUiStore.getState().setReplayRunId("run-1");
    applyReset(qc);
    expect(qc.getQueryData(qk.attempts())).toBeUndefined();
    expect(qc.getQueryData(qk.attempts("run-1"))).toBeUndefined();
    expect(qc.getQueryData(qk.runs)).toBeUndefined();
    expect(useUiStore.getState().replayRunId).toBeNull();
  });
});
