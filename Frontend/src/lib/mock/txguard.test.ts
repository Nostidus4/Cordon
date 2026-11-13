import { beforeEach, describe, expect, it } from "vitest";
import { fakeAddress } from "./core";
import { TxGuardError, checkTx, listTxChecks, rejectTx, resetTxGuardMock, sendTx, type MockWorld } from "./txguard";

const U = (n: number) => (BigInt(n) * 10n ** 6n).toString();
const world: MockWorld = {
  keys: { key_minh: { address: fakeAddress("key_minh"), label: "Thẻ của Minh", principalId: "minh" } },
  recipients: ["vendor_cloud"], protocols: ["MockDEX"], vaultUsdc: BigInt(U(200_000)),
};
const pay = (to: string, amount = U(1_000)) => ({ kind: "pay" as const, signer: "key_minh", token: "tUSDC", to, amount });

beforeEach(resetTxGuardMock);

describe("mock Tx Guardian mirrors the backend rules", () => {
  it("a whitelisted payment is safe; a stranger is flagged and the chain would say no", () => {
    const ok = checkTx(world, pay("vendor_cloud"), 1);
    expect(ok.level).toBe("safe");
    expect(ok.diff.outflows[0].amount.display).toBe("1.000");
    const bad = checkTx(world, pay("stranger_wallet"), 2);
    expect(bad.level).toBe("danger");
    expect(bad.diff.chainReason).toBe("RECIPIENT_NOT_ALLOWED");
    expect(bad.findings.map((f) => f.ruleId)).toContain("unknown_contract");
  });

  it("flags unlimited approval, drain and a swap without a price floor", () => {
    const a = checkTx(world, { kind: "approve", signer: "key_minh", token: "tUSDC", to: "vendor_cloud", amount: (2n ** 256n - 1n).toString() }, 1);
    expect(a.findings.map((f) => f.ruleId)).toContain("unlimited_approval");
    expect(checkTx(world, pay("vendor_cloud", U(195_000)), 1).findings.map((f) => f.ruleId)).toContain("drain");
    const s = checkTx(world, { kind: "swap", signer: "key_minh", token: "tUSDC", tokenOut: "tTKB", to: "MockDEX", amount: U(1_000) }, 1);
    expect(s.findings.map((f) => f.ruleId)).toContain("abnormal_slippage");
    expect(s.diff.inflows[0].token).toBe("tTKB");
  });

  it("every number in the explanation is one of the diff's amounts", () => {
    const c = checkTx(world, pay("stranger_wallet", U(20_000)), 1);
    const shown = new Set(c.numbers.map((n) => n.value));
    for (const tok of c.explanationVi.match(/\d+(?:[.,]\d+)*/g) ?? []) expect(shown.has(tok)).toBe(true);
  });

  it("reject keeps the check, sets the status and a later send is a 409", () => {
    const c = checkTx(world, pay("vendor_cloud"), 1);
    expect(rejectTx(c.id).status).toBe("rejected");
    expect(() => sendTx(c.id)).toThrow(TxGuardError);
    try { sendTx(c.id); } catch (e) { expect((e as TxGuardError).status).toBe(409); }
    expect(listTxChecks()[0].sentTx).toBeNull();
  });

  it("send marks the check sent with the chain's verdict", () => {
    const ok = sendTx(checkTx(world, pay("vendor_cloud"), 1).id);
    expect(ok.status).toBe("sent");
    expect(ok.sentTx?.ok).toBe(true);
    const no = sendTx(checkTx(world, pay("stranger_wallet"), 1).id);
    expect(no.sentTx).toMatchObject({ ok: false, reasonCode: "RECIPIENT_NOT_ALLOWED" });
  });
});
