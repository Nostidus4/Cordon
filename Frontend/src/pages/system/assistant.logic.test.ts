import { describe, expect, it } from "vitest";
import { checkFor, fmtArgs, summarizeLog } from "./assistant.logic";
import type { AssistantLog } from "../../types";

const log = (o: Partial<AssistantLog> = {}): AssistantLog => ({
  id: "l", question: "q", toolCalls: [{ tool: "simulate_compromise", args: { principals: ["minh"] }, resultSummary: "" }],
  answer: { answer: "a", numbers: [{ label: "A", value: "1", source: "simulate", path: "x" }, { label: "B", value: "2", source: "simulate", path: "y" }], highlight: { nodeIds: [], edgeIds: [] } },
  checks: [{ label: "A", value: "1", source: "simulate", path: "x", toolValue: "1", match: true }, { label: "B", value: "2", source: "simulate", path: "y", toolValue: "3", match: false }],
  uncovered: [], numbersVerified: false, createdAt: "", ...o,
});
describe("summarizeLog", () => {
  it("counts failed checks", () => { expect(summarizeLog(log())).toMatchObject({ total: 2, verified: 1, failed: 1, allOk: false, fallback: false }); });
  it("is ok when all match and nothing is uncovered", () => {
    const l = log(); l.checks[1].match = true; l.numbersVerified = true;
    expect(summarizeLog(l).allOk).toBe(true);
    expect(summarizeLog({ ...l, uncovered: ["9"] }).allOk).toBe(false);
  });
  it("detects the fixed-answer fallback", () => { expect(summarizeLog(log({ toolCalls: [], answer: { answer: "x", numbers: [], highlight: { nodeIds: [], edgeIds: [] } }, checks: [] })).fallback).toBe(true); });
});
describe("helpers", () => {
  it("finds the check for a number", () => { expect(checkFor(log(), { label: "B", path: "y" }, 0)?.toolValue).toBe("3"); });
  it("formats tool args", () => { expect(fmtArgs({ principals: ["minh"], n: 2 })).toBe('principals: ["minh"], n: 2'); expect(fmtArgs({})).toBe(""); });
});
