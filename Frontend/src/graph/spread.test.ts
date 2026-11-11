import { describe, expect, it } from "vitest";
import { buildGraph, seedState, simulate } from "../lib/mock/core";
import { buildSpreadPlan, busEdgeId, counterAt, spreadOrder } from "./spread";

const s = seedState();
const graph = buildGraph(s, 100);
const plan = (ids: string[]) => buildSpreadPlan(simulate(s, ids), graph, ids);
const U = (n: number) => BigInt(n) * 1_000_000n;

describe("buildSpreadPlan", () => {
  it("minh: origin, then the on-chain key, then 4 declared keys, 300 ms apart", () => {
    const p = plan(["minh"]);
    expect(p.steps.map((x) => x.kind)).toEqual(["origin", "onchain", "declared", "declared", "declared", "declared"]);
    expect(p.steps.map((x) => x.at)).toEqual([0, 300, 600, 900, 1200, 1500]);
    expect(p.steps[1].keyId).toBe("key_minh");
    expect(p.steps[0].nodeIds).toEqual(["vault", "p:minh"]);
    expect(p.steps[1].edgeIds).toContain("e:minh-holds-key_minh");
    expect(p.steps[2].edgeIds).toContain("e:minh-controls-agent_data");
    expect(p.steps[2].edgeIds).toContain(busEdgeId("agent_data"));
    expect([p.youThink, p.enforced, p.estimated]).toEqual([U(20000), U(20000), U(100000)]);
  });

  it("minh + huy: 3 on-chain keys first (minh 1 + huy 2), then the 4 declared ones", () => {
    const p = plan(["minh", "huy"]);
    expect(p.onchainCount).toBe(3);
    expect(p.declaredCount).toBe(4);
    expect(p.steps.slice(1, 4).every((x) => x.kind === "onchain")).toBe(true);
    expect(p.estimated).toBe(U(140000));
  });
});

describe("counterAt (Bạn nghĩ -> Ước tính)", () => {
  it("starts at youThink and lands exactly on estimated", () => {
    const p = plan(["minh"]);
    expect(counterAt(p, 0)).toBe(U(20000));
    expect(counterAt(p, 1)).toBe(U(20000)); // origin only
    expect(counterAt(p, p.steps.length)).toBe(U(100000));
    expect(counterAt(p, 99)).toBe(U(100000));
  });

  it("is monotonic and climbs 20.000 per declared key for minh", () => {
    const p = plan(["minh"]);
    const vals = p.steps.map((_, i) => counterAt(p, i + 1));
    expect(vals).toEqual([U(20000), U(20000), U(40000), U(60000), U(80000), U(100000)]);
  });

  it("minh + huy: youThink 60.000 -> enforced 60.000 -> estimated 140.000, never overshoots", () => {
    const p = plan(["minh", "huy"]);
    const vals = p.steps.map((_, i) => counterAt(p, i + 1));
    expect(vals[0]).toBe(U(60000));
    expect(vals[3]).toBe(U(60000));
    expect(vals[vals.length - 1]).toBe(U(140000));
    for (let i = 1; i < vals.length; i++) expect(vals[i] >= vals[i - 1]).toBe(true);
  });

  it("handles a plan with no declared keys (huy alone: enforced = estimated)", () => {
    const p = plan(["huy"]);
    expect(p.declaredCount).toBe(0);
    expect(counterAt(p, p.steps.length)).toBe(p.estimated);
    expect(p.estimated).toBe(U(40000));
  });
});

describe("spreadOrder", () => {
  it("v1 minh: 5 key nodes reached, on-chain key first, then the 4 declared ones", () => {
    const sim = simulate(s, ["minh"]);
    const order = spreadOrder(graph, sim, ["minh"]);
    expect(order).toHaveLength(6); // origin + 5 keys
    const keyIds = order.flatMap((o) => o.nodeIds.filter((n) => n.startsWith("k:")));
    expect(keyIds).toEqual(["k:key_minh", "k:key_agent_data", "k:key_agent_intl_pay", "k:key_agent_rebalance", "k:key_svc_payment"]);
    expect(new Set(keyIds).size).toBe(5);
    expect(order[0].nodeIds).toContain("p:minh");
    expect(order[1].edgeIds).toContain("e:minh-holds-key_minh");
    expect(order[2].edgeIds).toContain("e:minh-controls-agent_data");
    expect(order[5].edgeIds).toContain("e:minh-admins-svc_payment");
  });
  it("minh + huy: on-chain keys of both people come before any declared key", () => {
    const sim = simulate(s, ["minh", "huy"]);
    const keyIds = spreadOrder(graph, sim, ["minh", "huy"]).flatMap((o) => o.nodeIds.filter((n) => n.startsWith("k:")));
    expect(keyIds.slice(0, 3).sort()).toEqual(["k:key_huy_1", "k:key_huy_2", "k:key_minh"]);
    expect(keyIds).toHaveLength(7);
  });
});
