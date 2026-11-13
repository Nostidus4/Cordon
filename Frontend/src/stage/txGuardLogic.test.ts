import { describe, expect, it, vi } from "vitest";
import type { Api } from "../lib/api";
import type { GraphNode, TxCheck } from "../types";
import { buildPrepared, formOptions, rejectCheck, sendCheck, toBaseUnits, type TxForm } from "./txGuardLogic";

const check = (status: TxCheck["status"]): TxCheck => ({
  id: 7, createdAt: 0, status, sentTx: null, level: "danger", explanationVi: "", explanationSource: "template", numbers: [], numbersVerified: true,
  prepared: { kind: "pay", signer: "key_minh", to: "stranger_wallet", token: "tUSDC", amount: "1", memo: "", source: "paste" },
  diff: { outflows: [], inflows: [], approvals: [], recipient: "0x", recipientLabel: null, recipientKnown: false, principalId: "minh", chainReason: null, simulated: true },
  findings: [],
});

function fakeApi() {
  return {
    checkTx: vi.fn(), getTxChecks: vi.fn(), getTxCheck: vi.fn(),
    sendTx: vi.fn(async () => check("sent")),
    rejectTx: vi.fn(async () => check("rejected")),
  } satisfies Partial<Record<keyof Api, unknown>>;
}

describe("B05 reject / send", () => {
  it("clicking Từ chối calls only the reject endpoint, never send or check", async () => {
    const api = fakeApi();
    const out = await rejectCheck(api as unknown as Api, 7);
    expect(api.rejectTx).toHaveBeenCalledTimes(1);
    expect(api.rejectTx).toHaveBeenCalledWith(7);
    expect(api.sendTx).not.toHaveBeenCalled();
    expect(api.checkTx).not.toHaveBeenCalled();
    expect(out.status).toBe("rejected");
  });

  it("Gửi calls only the send endpoint", async () => {
    const api = fakeApi();
    await sendCheck(api as unknown as Api, 7);
    expect(api.sendTx).toHaveBeenCalledWith(7);
    expect(api.rejectTx).not.toHaveBeenCalled();
  });
});

describe("B05 form logic", () => {
  it("toBaseUnits turns what a person types into integer base units, never a float", () => {
    expect(toBaseUnits("1.000", 6)).toBe("1000000000");
    expect(toBaseUnits("1000", 6)).toBe("1000000000");
    expect(toBaseUnits("1,5", 6)).toBe("1500000");
    expect(toBaseUnits("0,000001", 6)).toBe("1");
    expect(toBaseUnits("1", 18)).toBe("1000000000000000000");
    expect(toBaseUnits("0,0000001", 6)).toBeNull(); // more decimals than the token has
    expect(toBaseUnits("abc", 6)).toBeNull();
    expect(toBaseUnits("", 6)).toBeNull();
  });

  const base: TxForm = { kind: "pay", signer: "key_minh", token: "tUSDC", tokenOut: "", to: "vendor_cloud", amount: "1.000", minOut: "", data: "" };
  it("buildPrepared builds each kind and explains what is missing in Vietnamese", () => {
    expect(buildPrepared(base, () => 6)).toEqual({ tx: { kind: "pay", signer: "key_minh", token: "tUSDC", to: "vendor_cloud", amount: "1000000000", source: "paste" } });
    expect(buildPrepared({ ...base, signer: "" }, () => 6)).toEqual({ error: "Chọn thẻ ký giao dịch." });
    expect(buildPrepared({ ...base, amount: "x" }, () => 6)).toEqual({ error: "Số tiền chưa đúng." });
    const swap = buildPrepared({ ...base, kind: "swap", tokenOut: "tTKB", minOut: "" }, () => 6);
    expect("tx" in swap && swap.tx.minOut).toBeUndefined(); // empty = not set, the rules then flag it
    const raw = buildPrepared({ ...base, kind: "raw", data: "0x095ea7b3" }, () => 6);
    expect("tx" in raw && raw.tx).toMatchObject({ kind: "raw", data: "0x095ea7b3" });
    expect(buildPrepared({ ...base, kind: "raw", data: "zz" }, () => 6)).toHaveProperty("error");
  });

  it("formOptions reads the graph nodes (live ids carry the address, mock ids the seed id)", () => {
    const n = (id: string, type: GraphNode["type"], label: string, data = {}): GraphNode => ({ id, type, label, data });
    const o = formOptions([
      n("k:0xAbC", "Key", "Thẻ của Minh"), n("r:0xDef", "Recipient", "Cloud", { allowListed: true }),
      n("t:0x123", "Token", "tUSDC", { decimals: 6 }), n("proto:0x456", "Protocol", "MockDEX"), n("p:minh", "Principal", "Minh"),
    ]);
    expect(o.keys).toEqual([{ ref: "0xAbC", label: "Thẻ của Minh", decimals: undefined, allowed: undefined }]);
    expect(o.recipients[0]).toMatchObject({ ref: "0xDef", allowed: true });
    expect(o.tokens[0]).toMatchObject({ ref: "0x123", decimals: 6 });
    expect(o.protocols[0].ref).toBe("0x456");
  });
});
