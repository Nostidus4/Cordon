import { describe, expect, it } from "vitest";
import type { GraphSnapshot } from "../types";
import { buildGraph, seedState, applyCalls, changeToCalls, U } from "../lib/mock/core";
import { DIM, computeLayout, districtCols } from "./layout";

const v1 = (): GraphSnapshot => buildGraph(seedState(), 100);
const v2 = (): GraphSnapshot => {
  const s = seedState();
  applyCalls(s, changeToCalls(s, { kind: "consolidate", into: "minh", keys: ["key_agent_data", "key_agent_intl_pay", "key_agent_rebalance", "key_svc_payment"], sharedCapRaw: U(30000).toString() }));
  return buildGraph(s, 101);
};
const overlap = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("computeLayout", () => {
  it("is deterministic and independent of node/district input order", () => {
    const a = computeLayout(v1(), { mode: "map" });
    expect(computeLayout(v1(), { mode: "map" })).toEqual(a);
    const g = v1();
    const shuffled: GraphSnapshot = { ...g, nodes: [...g.nodes].reverse(), districts: [...g.districts].reverse(), edges: [...g.edges].reverse() };
    expect(computeLayout(shuffled, { mode: "map" })).toEqual(a);
  });

  it("puts treasury above vault above districts, districts left to right in canonical order", () => {
    const l = computeLayout(v1());
    expect(l.boxes.treasury.y).toBeLessThan(l.boxes.vault.y);
    const dy = l.boxes["p:minh"].y;
    expect(l.boxes.vault.y + l.boxes.vault.h).toBeLessThan(dy);
    expect(l.districtIds).toEqual(["p:minh", "p:agent_data", "p:agent_intl_pay", "p:agent_rebalance", "p:svc_payment", "p:huy", "p:lan"]);
    const xs = l.districtIds.map((id) => l.boxes[id].x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
  });

  it("keeps every key inside its district and nothing overlaps", () => {
    for (const g of [v1(), v2()]) {
      const l = computeLayout(g, { mode: "map", showMarket: true });
      for (const d of g.districts) {
        const box = l.boxes[`p:${d.principalId}`];
        for (const k of d.keys) {
          const kb = l.boxes[`k:${k}`];
          expect(kb.x).toBeGreaterThanOrEqual(box.x);
          expect(kb.y).toBeGreaterThanOrEqual(box.y);
          expect(kb.x + kb.w).toBeLessThanOrEqual(box.x + box.w);
          expect(kb.y + kb.h).toBeLessThanOrEqual(box.y + box.h);
        }
      }
      const top = Object.entries(l.boxes).filter(([id]) => !id.startsWith("k:"));
      for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) expect(overlap(top[i][1], top[j][1]), `${top[i][0]} x ${top[j][0]}`).toBe(false);
      const keys = Object.entries(l.boxes).filter(([id]) => id.startsWith("k:"));
      for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) expect(overlap(keys[i][1], keys[j][1]), `${keys[i][0]} x ${keys[j][0]}`).toBe(false);
    }
  });

  it("policy v2 moves the 5 keys into district minh (two columns) and drops the empty districts", () => {
    const l1 = computeLayout(v1()), l2 = computeLayout(v2());
    expect(l2.districtIds).toEqual(["p:minh", "p:huy", "p:lan"]);
    expect(districtCols(5)).toBe(2);
    expect(l2.boxes["p:minh"].w).toBe(2 * DIM.keyW + DIM.keyGap + 2 * DIM.pad);
    for (const k of ["key_minh", "key_agent_data", "key_agent_intl_pay", "key_agent_rebalance", "key_svc_payment"]) {
      const kb = l2.boxes[`k:${k}`], mb = l2.boxes["p:minh"];
      expect(kb.x >= mb.x && kb.x + kb.w <= mb.x + mb.w).toBe(true);
    }
    expect(l1.boxes["k:key_agent_data"].x).not.toBe(l2.boxes["k:key_agent_data"].x);
    expect(l1.signature).not.toBe(l2.signature);
  });

  it("market band only exists when requested and sits below the districts", () => {
    const off = computeLayout(v1(), { showMarket: false }), on = computeLayout(v1(), { showMarket: true });
    expect(off.boxes["r:vendor_cloud"]).toBeUndefined();
    expect(on.boxes["r:vendor_cloud"].y).toBeGreaterThan(on.boxes["p:huy"].y + on.boxes["p:huy"].h);
  });

  it("simulate mode is more compact and omits governance nodes", () => {
    const m = computeLayout(v1(), { mode: "map" }), s = computeLayout(v1(), { mode: "simulate" });
    expect(s.boxes.council).toBeUndefined();
    expect(s.bounds.h).toBeLessThan(m.bounds.h);
  });
});
