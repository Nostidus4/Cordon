import { describe, expect, it } from "vitest";
import { CHECKS, callSignature, errorName, traceAttempt } from "./trace";
import { SCENE4_STEPS } from "../../shared/scenario4";
import { REASONS, type ReasonCode } from "../../shared/reasonCodes";
import type { Attempt } from "../../types";

const mk = (kind: Attempt["action"]["kind"], outcome: Attempt["outcome"], reasonCode: ReasonCode | null): Pick<Attempt, "action" | "outcome" | "reasonCode"> =>
  ({ action: { kind, label: "x" }, outcome, reasonCode });
const statuses = (a: ReturnType<typeof mk>) => traceAttempt(a).stages.map((s) => s.status[0]).join("");

describe("traceAttempt follows spec §6.3 order", () => {
  it("has the 8 checks in order", () => {
    expect(CHECKS.map((c) => c.id)).toEqual(["paused", "registered", "unlocked", "token", "target", "keycap", "districtcap", "transfer"]);
  });
  it("ok = all pass", () => {
    expect(statuses(mk("pay", "ok", null))).toBe("pppppppp");
    expect(traceAttempt(mk("pay", "ok", null)).failId).toBeNull();
  });
  it.each<[ReasonCode, string, string]>([
    ["VAULT_PAUSED", "fssssss" + "s", "paused"],
    ["KEY_NOT_REGISTERED", "pfsssss" + "s", "registered"],
    ["DISTRICT_LOCKED", "ppfssss" + "s", "unlocked"],
    ["TOKEN_NOT_ALLOWED", "pppfsss" + "s", "token"],
    ["RECIPIENT_NOT_ALLOWED", "ppppfss" + "s", "target"],
    ["PROTOCOL_NOT_ALLOWED", "ppppfss" + "s", "target"],
    ["CARD_DAILY_CAP", "pppppfs" + "s", "keycap"],
    ["DISTRICT_DAILY_CAP", "ppppppf" + "s", "districtcap"],
    ["SLIPPAGE", "ppppppp" + "f", "transfer"],
  ])("%s fails exactly at its check", (code, expected, id) => {
    const t = traceAttempt(mk("pay", "reverted", code));
    expect(t.stages.map((s) => s.status[0]).join("")).toBe(expected);
    expect(t.failId).toBe(id);
    expect(t.gate).toBe("pass");
  });
  it("BLOCKED_AT_PROTOCOL fails at the Tx AllowList gate and skips everything", () => {
    const t = traceAttempt(mk("approve", "blocked_at_protocol", "BLOCKED_AT_PROTOCOL"));
    expect(t.gate).toBe("fail");
    expect(t.stages.every((s) => s.status === "skip")).toBe(true);
    expect(t.failId).toBeNull();
  });
  it("council lock never goes through the 8 checks", () => {
    expect(traceAttempt(mk("lock", "ok", null)).route).toBe("council");
  });
  it("every scene-4 step traces consistently with its expected outcome/reason", () => {
    for (const st of SCENE4_STEPS) {
      const t = traceAttempt(mk(st.kind, st.expect, st.reason ?? null));
      if (st.expect === "reverted") expect(t.stages.find((s) => s.status === "fail")?.reasons).toContain(st.reason);
      if (st.expect === "blocked_at_protocol") expect(t.gate).toBe("fail");
    }
  });
  it("error names come from §6.4", () => {
    expect(errorName("DISTRICT_DAILY_CAP")).toBe("PrincipalDailyCapExceeded()");
    expect(errorName("BLOCKED_AT_PROTOCOL")).toBeNull();
    for (const c of Object.keys(REASONS) as ReasonCode[]) if (REASONS[c].error) expect(errorName(c)).toMatch(/\(\)$/);
  });
  it("call signature", () => {
    expect(callSignature({ signer: "key_minh", action: { kind: "pay", label: "", token: "tUSDC", to: "vendor_cloud", amount: { raw: "1", display: "10.000" } } })).toBe("PolicyVault.pay(tUSDC, vendor_cloud, 10.000)");
  });
});
