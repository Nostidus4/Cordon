// Pure helpers of the policy-state section: flash snapshot, token decimals, protocol label parsing.
import type { GraphSnapshot } from "../../types";
import { policyLabel } from "../../lib/policy";

/** Token decimals as deployed (spec §5): tUSDC 6, tTKB 18, tSCAM 18. */
export const TOKEN_DECIMALS: Record<string, number> = { tUSDC: 6, tTKB: 18, tSCAM: 18 };
export const decimalsOf = (symbol: string): number | null => TOKEN_DECIMALS[symbol] ?? null;

/** "MockDEX.swapExactIn" -> target + function name. */
export function parseProtocol(label: string): { target: string; fn: string } {
  const i = label.lastIndexOf(".");
  return i < 0 ? { target: label, fn: "swapExactIn" } : { target: label.slice(0, i), fn: label.slice(i + 1) };
}

/** Flat map of the values a viewer wants to see flash when they change (feeds useChanged). */
export function policySnapshot(graph: GraphSnapshot | undefined, vault?: { usdc: string; tkb: string }): Record<string, string> {
  const s: Record<string, string> = {};
  if (graph) {
    const v = graph.nodes.find((n) => n.id === "vault");
    s["vault:paused"] = String(v?.data.paused === true);
    s["policy"] = String(policyLabel(graph));
    const key = (id: string) => graph.nodes.find((n) => n.id === `k:${id}`)?.data;
    for (const d of graph.districts) {
      s[`d:${d.principalId}:cap`] = d.dailyCap?.raw ?? "none";
      s[`d:${d.principalId}:spent`] = d.spentToday.raw;
      s[`d:${d.principalId}:locked`] = String(d.locked);
      for (const k of d.keys) {
        const n = key(k);
        s[`k:${k}:spent`] = n?.keySpentToday?.raw ?? "";
        s[`k:${k}:cap`] = n?.keyDailyCap?.raw ?? "";
        s[`k:${k}:role`] = String(n?.active !== false);
        s[`k:${k}:dist`] = d.principalId;
      }
    }
    for (const n of graph.nodes) if (n.type === "Token" || n.type === "Protocol" || n.type === "Recipient") s[`allow:${n.id}`] = "1";
    s["allow:count"] = String(graph.nodes.filter((n) => n.type === "Token" || n.type === "Protocol" || n.type === "Recipient").length);
  }
  if (vault) { s["usdc"] = vault.usdc; s["tkb"] = vault.tkb; }
  return s;
}
