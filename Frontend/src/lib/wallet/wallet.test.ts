import { describe, expect, it } from "vitest";
import { isWalletApproveEnabled, type WalletEnv } from "./config";
import { WalletFlowError, walletErrorMessage } from "./errors";
import { guardianChain, shortHash } from "./approve";

const base: WalletEnv = {
  apiMode: "live",
  l1RpcUrl: "http://127.0.0.1:9650/rpc",
  councilAddress: "0xE5a4F0da66836cB79FAc4618101C8CFf5E49ab02",
  l1ChainId: 845357,
  nativeSymbol: "GRD",
};

describe("isWalletApproveEnabled", () => {
  it("is on only with live + rpc + council + wallet", () => {
    expect(isWalletApproveEnabled(base, true)).toBe(true);
  });
  it("is off in mock mode (GitHub Pages)", () => {
    expect(isWalletApproveEnabled({ ...base, apiMode: "mock" }, true)).toBe(false);
  });
  it("is off without wallet, rpc, or a valid council address", () => {
    expect(isWalletApproveEnabled(base, false)).toBe(false);
    expect(isWalletApproveEnabled({ ...base, l1RpcUrl: undefined }, true)).toBe(false);
    expect(isWalletApproveEnabled({ ...base, councilAddress: undefined }, true)).toBe(false);
    expect(isWalletApproveEnabled({ ...base, councilAddress: "0x123" }, true)).toBe(false);
  });
});

describe("guardianChain", () => {
  it("describes the Guardian L1", () => {
    const c = guardianChain(base);
    expect(c.id).toBe(845357);
    expect(c.name).toBe("Guardian L1 (Fuji)");
    expect(c.nativeCurrency.symbol).toBe("GRD");
    expect(c.rpcUrls.default.http[0]).toBe(base.l1RpcUrl);
  });
});

describe("walletErrorMessage", () => {
  it("maps custom errors found down the cause chain", () => {
    expect(walletErrorMessage({ cause: { cause: { errorName: "ConflictOfInterest" } } })).toBe("Bạn là người được xét, không được duyệt.");
    expect(walletErrorMessage({ cause: { data: { errorName: "AlreadyApproved" } } })).toContain("đã duyệt");
    expect(walletErrorMessage({ cause: { errorName: "NotCouncilMember" } })).toContain("không thuộc Hội đồng");
    expect(walletErrorMessage({ shortMessage: "reverted with custom error ProposalNotOpen()" })).toContain("không còn mở");
  });
  it("maps user rejection (EIP-1193 4001)", () => {
    expect(walletErrorMessage({ code: 4001 })).toContain("từ chối");
    expect(walletErrorMessage({ name: "UserRejectedRequestError" })).toContain("từ chối");
  });
  it("maps RPC down and falls back without throwing", () => {
    expect(walletErrorMessage({ name: "HttpRequestError", message: "HTTP request failed" })).toContain("Không kết nối được");
    expect(walletErrorMessage(undefined)).toContain("Không ký được");
    expect(walletErrorMessage("boom")).toContain("Không ký được");
  });
  it("passes WalletFlowError text through", () => {
    expect(walletErrorMessage(new WalletFlowError("Ví này không thuộc Hội đồng."))).toBe("Ví này không thuộc Hội đồng.");
  });
});

describe("shortHash", () => {
  it("shortens", () => {
    expect(shortHash("0x" + "a".repeat(64))).toBe("0xaaaaaa…aaaaaa");
  });
});
