// Live tap on the stream: counters per edge of the architecture diagram, animated packets, pulse. Pure routing in `routeFor`.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { useStream } from "../../hooks/useStream";
import type { StreamMessage, StreamMessageType } from "../../types";

export type EdgeId =
  | "web-api" | "api-chain" | "attacker-chain" | "agent-chain" | "assistant-api"
  | "chain-allow" | "chain-registry" | "chain-vault" | "chain-council" | "chain-dex" | "chain-tokens";
export interface Hop { e: EdgeId; rev?: boolean }
export interface Route { hops: Hop[]; color: string }

export const COLOR = { ok: "#22c55e", bad: "#ff2d3d", amber: "#ffb300", event: "#0a84d8", council: "#8e5cf6", agent: "#ff8c42", graph: "#8a4eff", city: "#18a8ff", rest: "#2d2250", ask: "#1565e8" } as const;

const EVENT_TARGETS: Record<string, EdgeId[]> = {
  Paid: ["chain-vault", "chain-tokens"], Swapped: ["chain-vault", "chain-dex"],
  Proposed: ["chain-council"], Approved: ["chain-council"], Executed: ["chain-council"], Cancelled: ["chain-council"], EmergencyAction: ["chain-council"],
  PrincipalLocked: ["chain-vault", "chain-allow"], PrincipalUnlocked: ["chain-vault", "chain-allow"],
  AllowListRoleSet: ["chain-allow"], KeyMoved: ["chain-registry"], PrincipalCreated: ["chain-registry"],
};
const up: Hop[] = [{ e: "api-chain", rev: true }, { e: "web-api", rev: true }]; // indexer -> API -> SSE -> web

/** Which edges (in order) a stream message travels, and in which colour. */
export function routeFor(m: StreamMessage): Route[] {
  switch (m.type) {
    case "attempt": {
      const a = m.data;
      const source: Hop[] = a.action === "lock" ? [{ e: "web-api" }, { e: "api-chain" }] : a.signer === "key_agent_rebalance" && a.source === "agent" ? [{ e: "agent-chain" }] : [{ e: "attacker-chain" }];
      const color = a.outcome === "ok" ? COLOR.ok : a.outcome === "reverted" ? COLOR.bad : COLOR.amber;
      const targets: EdgeId[] = a.outcome === "blocked_at_protocol" ? ["chain-allow"] : a.action === "lock" ? ["chain-council"] : a.action === "swap" ? ["chain-vault", "chain-dex"] : (a.action === "approve" || a.action === "raw_call") ? ["chain-tokens"] : ["chain-vault"];
      return targets.map((t) => ({ hops: [...source, { e: t }, ...up], color }));
    }
    case "event": return (EVENT_TARGETS[m.data.name] ?? ["chain-vault"]).map((t) => ({ hops: [{ e: t, rev: true }, ...up], color: COLOR.event }));
    case "proposal_updated": return [{ hops: [{ e: "chain-council", rev: true }, ...up], color: COLOR.council }];
    case "agent_run": return [{ hops: [{ e: "agent-chain" }, ...up], color: COLOR.agent }];
    case "graph_updated": return [{ hops: [{ e: "web-api", rev: true }], color: COLOR.graph }];
    case "city_updated": return [{ hops: [{ e: "web-api", rev: true }], color: COLOR.city }];
    case "incident_updated": return [{ hops: [{ e: "web-api", rev: true }], color: COLOR.bad }];
    case "reset": return [];
  }
}

export interface Packet { id: number; hops: Hop[]; color: string }
export interface Tick { id: number; type: StreamMessageType; text: string; at: number; color: string }

interface Feed {
  total: number;
  byType: Record<StreamMessageType, number>;
  edges: Partial<Record<EdgeId, number>>;
  sse: number;
  rest: number;
  lastAt: number;
  packets: Packet[];
  ticks: Tick[];
  ingest: (m: StreamMessage) => void;
  rest1: (packet?: boolean) => void;
  /** push a route by hand (e.g. the assistant: web -> API <-> assistant), counting its edges */
  inject: (r: Route) => void;
  done: (id: number) => void;
  clear: () => void;
}
const zero = (): Record<StreamMessageType, number> => ({ event: 0, attempt: 0, graph_updated: 0, proposal_updated: 0, agent_run: 0, city_updated: 0, incident_updated: 0, reset: 0 });
let seq = 0;
const MAX_PACKETS = 28;

const describe = (m: StreamMessage): string => {
  switch (m.type) {
    case "attempt": return `${m.data.signerLabel} · ${m.data.outcome === "ok" ? "OK" : m.data.reasonCode ?? m.data.outcome}`;
    case "event": return `${m.data.name} @${m.data.block}`;
    case "proposal_updated": return `#${m.data.proposalId} ${m.data.status} (${m.data.approvals}/2)`;
    case "agent_run": return `${m.data.decision ? "swap" : "none"} · ${m.data.outcome}`;
    case "graph_updated": return `v${m.data.policyLabel ?? m.data.policyVersion} · block ${m.data.block}`;
    case "city_updated": return "8 tòa nhà";
    case "incident_updated": return `sự cố #${m.data.id} · ${m.data.status}`;
    case "reset": return "đặt lại";
  }
};
const colorOf = (m: StreamMessage) => routeFor(m)[0]?.color ?? COLOR.rest;

export const useFeed = create<Feed>((set) => ({
  total: 0, byType: zero(), edges: {}, sse: 0, rest: 0, lastAt: 0, packets: [], ticks: [],
  ingest: (m) => set((s) => {
    if (m.type === "reset") return { byType: { ...zero(), reset: s.byType.reset + 1 }, edges: {}, total: 0, sse: 0, packets: [], ticks: [], lastAt: Date.now() };
    const routes = routeFor(m);
    const edges = { ...s.edges };
    const seen = new Set<EdgeId>();
    for (const r of routes) for (const h of r.hops) seen.add(h.e);
    seen.add("web-api"); // every stream message is pushed over SSE
    for (const e of seen) edges[e] = (edges[e] ?? 0) + 1;
    const packets = [...s.packets, ...routes.map((r) => ({ id: ++seq, hops: r.hops, color: r.color }))].slice(-MAX_PACKETS);
    return {
      total: s.total + 1, sse: s.sse + 1, byType: { ...s.byType, [m.type]: s.byType[m.type] + 1 }, edges, lastAt: Date.now(), packets,
      ticks: [{ id: ++seq, type: m.type, text: describe(m), at: Date.now(), color: colorOf(m) }, ...s.ticks].slice(0, 7),
    };
  }),
  rest1: (packet) => set((s) => ({
    rest: s.rest + 1,
    packets: packet ? [...s.packets, { id: ++seq, hops: [{ e: "web-api" as const }, { e: "api-chain" as const }], color: COLOR.rest }].slice(-MAX_PACKETS) : s.packets,
  })),
  inject: (r) => set((s) => {
    const edges = { ...s.edges };
    for (const e of new Set(r.hops.map((h) => h.e))) edges[e] = (edges[e] ?? 0) + 1;
    return { edges, packets: [...s.packets, { id: ++seq, hops: r.hops, color: r.color }].slice(-MAX_PACKETS) };
  }),
  done: (id) => set((s) => ({ packets: s.packets.filter((p) => p.id !== id) })),
  clear: () => set({ total: 0, byType: zero(), edges: {}, sse: 0, rest: 0, packets: [], ticks: [] }),
}));

/** Mount once on the page: feeds the store from the stream, and counts REST calls from the TanStack Query cache. */
export function useSystemFeed() {
  const qc = useQueryClient();
  useStream((m) => useFeed.getState().ingest(m));
  useEffect(() => qc.getQueryCache().subscribe((e) => {
    if (e.type === "updated" && e.action.type === "success") useFeed.getState().rest1(false);
  }), [qc]);
}
