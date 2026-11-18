// Live reads for /he-thong/bang-chung. Every value is a real RPC answer or an error message; nothing is faked.
import { useEffect, useState } from "react";
import { COUNCIL_MEMBERS, DEPLOYER, L1_CONTRACTS, L1_PRECOMPILES, MINH_KEYS, TX_ALLOWLIST } from "./deployment";
import { hexToNumber, readCodeSize, readRole, rpcCall, RpcError, withRetry } from "./rpc";

export type Read<T> = { state: "loading" } | { state: "ok"; value: T } | { state: "error"; message: string };
const loading = { state: "loading" } as const;

export interface Evidence {
  chainId: Read<number>;
  block: Read<number>;
  /** by contract id: code size in bytes (contracts) or 1 when the precompile answered a role read (precompiles) */
  code: Record<string, Read<number>>;
  /** by address: Tx AllowList role */
  roles: Record<string, Read<number>>;
  checkedAt: number | null;
}

export const ROLE_TARGETS = [...MINH_KEYS, ...COUNCIL_MEMBERS, DEPLOYER];

const toRead = async <T,>(p: Promise<T>): Promise<Read<T>> => {
  try { return { state: "ok", value: await p }; } catch (e) { return { state: "error", message: e instanceof RpcError ? e.message : "Lỗi không rõ" }; }
};

export function useChainEvidence(url: string, pollMs = 8000): Evidence | null {
  const [ev, setEv] = useState<Evidence | null>(url ? { chainId: loading, block: loading, code: {}, roles: {}, checkedAt: null } : null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const set = (f: (e: Evidence) => Evidence) => { if (alive) setEv((e) => (e ? f(e) : e)); };
    const loadStatic = async () => {
      const jobs: Promise<void>[] = [
        toRead(withRetry(() => rpcCall(url, "eth_chainId").then(hexToNumber))).then((r) => set((e) => ({ ...e, chainId: r }))),
        ...L1_CONTRACTS.map((c) => toRead(withRetry(() => readCodeSize(url, c.address))).then((r) => set((e) => ({ ...e, code: { ...e.code, [c.id]: r } })))),
        ...L1_PRECOMPILES.map((c) => toRead(withRetry(() => readRole(url, c.address, DEPLOYER.address).then(() => 1))).then((r) => set((e) => ({ ...e, code: { ...e.code, [c.id]: r } })))),
      ];
      await Promise.all(jobs);
    };
    const loadLive = async () => {
      const jobs: Promise<void>[] = [
        toRead(rpcCall(url, "eth_blockNumber").then(hexToNumber)).then((r) => set((e) => ({ ...e, block: r }))),
        ...ROLE_TARGETS.map((t) => toRead(readRole(url, TX_ALLOWLIST, t.address)).then((r) => set((e) => ({ ...e, roles: { ...e.roles, [t.address]: r } })))),
      ];
      await Promise.all(jobs);
      set((e) => ({ ...e, checkedAt: Date.now() }));
    };
    void loadStatic();
    void loadLive();
    const t = setInterval(() => void loadLive(), pollMs);
    return () => { alive = false; clearInterval(t); };
  }, [url, pollMs]);
  return ev;
}
