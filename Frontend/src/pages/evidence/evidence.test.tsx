// /bang-chung: RPC helpers (fake fetch), role sentence, and the no-RPC render (server render, no DOM needed).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CCHAIN_FUNDS, COUNCIL_MEMBERS, L1_CHAIN_ID, L1_CONTRACTS, MINH_KEYS, TX_ALLOWLIST } from "./deployment";
import EvidencePage, { NO_RPC_BANNER, rolesSentence } from "./EvidencePage";
import { codeSizeBytes, hexToNumber, parseRole, readAllowListData, readRole, roleLabel, rpcCall, RpcError } from "./rpc";

const fakeFetch = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("rpc helpers", () => {
  it("encodes readAllowList(address) call data", () => {
    expect(readAllowListData("0xd5B1EDf1710CAEb8B9b5e6c77BE4Db7DCAEecC67")).toBe("0xeb54dae1000000000000000000000000d5b1edf1710caeb8b9b5e6c77be4db7dcaeecc67");
  });
  it("parses hex numbers, roles and code size", () => {
    expect(hexToNumber("0xce62d")).toBe(L1_CHAIN_ID);
    expect(parseRole("0x" + "0".repeat(63) + "2")).toBe(2);
    expect(codeSizeBytes("0x")).toBe(0);
    expect(codeSizeBytes("0x6080")).toBe(2);
    expect([0, 1, 2].map(roleLabel)).toEqual(["Bị chặn gửi giao dịch", "Được gửi", "Quản trị"]);
  });
  it("rpcCall returns result and maps errors to Vietnamese messages", async () => {
    expect(await rpcCall("http://x", "eth_chainId", [], 1000, fakeFetch({ jsonrpc: "2.0", id: 1, result: "0xce62d" }))).toBe("0xce62d");
    await expect(rpcCall("http://x", "eth_sendRawTransaction", [], 1000, fakeFetch({ error: { code: -32601, message: "nope" } }))).rejects.toThrow(/Nút chain từ chối/);
    await expect(rpcCall("http://x", "eth_chainId", [], 1000, fakeFetch({}, 429))).rejects.toThrow(/giới hạn/);
    await expect(rpcCall("http://x", "eth_chainId", [], 1000, (async () => { throw new TypeError("fail"); }) as unknown as typeof fetch)).rejects.toBeInstanceOf(RpcError);
  });
  it("readRole sends eth_call to the Tx AllowList", async () => {
    let sent: { method: string; params: Array<{ to: string }> } | undefined;
    const f = (async (_u: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return new Response(JSON.stringify({ result: "0x" + "0".repeat(63) + "1" })); }) as unknown as typeof fetch;
    const orig = globalThis.fetch;
    globalThis.fetch = f;
    try { expect(await readRole("http://x", TX_ALLOWLIST, MINH_KEYS[0]!.address)).toBe(1); } finally { globalThis.fetch = orig; }
    expect(sent?.method).toBe("eth_call");
    expect(sent?.params[0]?.to).toBe(TX_ALLOWLIST);
  });
});

describe("rolesSentence", () => {
  const ok = (v: number) => ({ state: "ok", value: v }) as const;
  it("explains all-zero, all-one, mixed and unknown", () => {
    expect(rolesSentence([0, 0, 0, 0, 0].map(ok))).toMatch(/Cả 5 khoá đều đọc ra 0/);
    expect(rolesSentence([1, 1, 1, 1, 1].map(ok))).toMatch(/đang được gửi/);
    expect(rolesSentence([0, 1, 1, 1, 1].map(ok))).toMatch(/^1 trong 5/);
    expect(rolesSentence([ok(0), { state: "loading" }])).toMatch(/Chưa đọc đủ/);
  });
});

describe("static data", () => {
  it("has 8 contracts, 5 Minh keys, 3 council members, funds", () => {
    expect(L1_CONTRACTS).toHaveLength(8);
    expect(MINH_KEYS).toHaveLength(5);
    expect(COUNCIL_MEMBERS).toHaveLength(3);
    expect(CCHAIN_FUNDS.map((f) => f.id)).toContain("treasury");
  });
});

describe("EvidencePage without RPC", () => {
  it("shows the banner, frozen addresses and no live values", () => {
    const html = renderToStaticMarkup(<EvidencePage />);
    expect(html).toContain(NO_RPC_BANNER);
    for (const c of L1_CONTRACTS) expect(html).toContain(c.address);
    expect(html).toContain("testnet.snowtrace.io/address/");
    expect(html).toContain("chưa nối RPC");
    expect(html).not.toContain("Đang đọc");
  });
});
