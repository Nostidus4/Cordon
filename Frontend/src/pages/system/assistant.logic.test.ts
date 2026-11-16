import { describe, expect, it } from "vitest";
import { checkFor, fmtArgs, summarizeLog } from "./assistant.logic";
import type { AssistantLog } from "../../types";

const log = (o: Partial<AssistantLog> = {}): AssistantLog => ({
  id: 1, ts: 0, questionId: null, question: "q", answer: "a", screen: null, flaggedUntrusted: false,
  toolCalls: [{ name: "simulate_compromise", args: { principals: ["minh"] } }],
  checks: [{ label: "A", value: "1", toolValue: "1", match: true }, { label: "B", value: "2", toolValue: "3", match: false }],
  uncovered: [], numbersVerified: false, ...o,
});
describe("summarizeLog", () => {
  it("counts failed checks", () => { expect(summarizeLog(log())).toMatchObject({ total: 2, verified: 1, failed: 1, allOk: false, fallback: false }); });
  it("is ok when all match and nothing is uncovered", () => {
    const l = log(); l.checks![1].match = true; l.numbersVerified = true;
    expect(summarizeLog(l).allOk).toBe(true);
    expect(summarizeLog({ ...l, uncovered: ["9"] })).toMatchObject({ allOk: false, uncovered: 1 });
  });
  it("detects the fixed-answer fallback", () => { expect(summarizeLog(log({ toolCalls: [], checks: [] })).fallback).toBe(true); });
});
describe("helpers", () => {
  it("finds the check for a number", () => { expect(checkFor(log(), { label: "B", value: "2" }, 0)?.toolValue).toBe("3"); });
  it("falls back to the check at the same index", () => { expect(checkFor(log(), { label: "?", value: "?" }, 1)?.label).toBe("B"); });
  it("formats tool args", () => { expect(fmtArgs({ principals: ["minh"], n: 2 })).toBe('principals: ["minh"], n: 2'); expect(fmtArgs({})).toBe(""); });
});
