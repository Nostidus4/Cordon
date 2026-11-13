// GraphSnapshot + layout boxes + view state -> React Flow nodes/edges. Pure; the canvas feeds it (possibly tweened) boxes every frame.
import type { Edge, Node } from "@xyflow/react";
import type { EdgeSource, EdgeType, GraphEdge, GraphNode, GraphSnapshot, KeyKind, Money, NodeType } from "../types";
import type { Box, LayoutMode } from "./layout";
import { busEdgeId } from "./spread";

export type TweenBox = Box & { /** opacity 0..1 (fade in/out while re-laying out) */ o: number };
export interface Highlight { nodeIds: string[]; edgeIds: string[] }
export interface ViewState {
  mode: LayoutMode;
  showMarket: boolean;
  selectedId: string | null;
  highlight: Highlight;
  /** principal ids that carry a HIGH finding (yellow flag) */
  flagged: Set<string>;
  /** simulate: node ids / edge ids currently red */
  redNodes: Set<string>;
  redEdges: Set<string>;
  /** simulate: compromised principal ids (origin of the spread) */
  origins: Set<string>;
  /** simulate: dim everything the spread did not reach */
  dimUnreached: boolean;
}

export interface DistrictData extends Record<string, unknown> {
  principalId: string; label: string; kind: KeyKind; dailyCap: Money | null; spentToday: Money; locked: boolean; keyCount: number;
  keyCapSum: string; flagged: boolean; red: boolean; origin: boolean; amber: boolean; selected: boolean; dim: boolean; o: number; w: number; h: number; compact: boolean;
}
export interface KeyData extends Record<string, unknown> {
  keyId: string; label: string; kind: KeyKind; active: boolean; locked: boolean; cap?: Money; spent?: Money; declaredBy: string | null;
  red: boolean; amber: boolean; selected: boolean; dim: boolean; o: number; w: number; h: number;
}
export interface EntityData extends Record<string, unknown> {
  type: NodeType; label: string; balance?: Money; sub?: string; paused?: boolean; red: boolean; amber: boolean; selected: boolean; dim: boolean; o: number; w: number; h: number;
}
export type EdgeKind = "funds" | "approve" | "gov" | "bus" | "hold" | "decl" | "pay";
export interface FlowEdgeData extends Record<string, unknown> {
  kind: EdgeKind; source: EdgeSource; type?: EdgeType; /** declared edges run in lanes under the districts; nearest target = lane 0 */ lane?: number; tone: "idle" | "red" | "amber"; active: boolean; label?: string; note?: string; o: number; dim: boolean;
}

const MARKET: NodeType[] = ["Recipient", "Protocol", "Token"];
const GOV: NodeType[] = ["Council", "Member"];
const m = (x: Money | null | undefined) => (x ? BigInt(x.raw) : 0n);

export function isVisibleNode(n: GraphNode, mode: LayoutMode, showMarket: boolean): boolean {
  if (n.type === "Principal" || n.type === "Key" || n.type === "Treasury" || n.type === "Vault") return true;
  if (MARKET.includes(n.type)) return mode === "map" && showMarket;
  if (GOV.includes(n.type)) return mode === "map";
  return false;
}

const KIND_OF_EDGE = (e: GraphEdge): EdgeKind | null => {
  switch (e.type) {
    case "FUNDS": return "funds";
    case "APPROVES": return "approve";
    case "HOLDS_KEY": return "hold";
    case "CONTROLS": case "ADMINS": return "decl";
    case "MAY_PAY": case "MAY_CALL": return "pay";
  }
};
const HANDLES: Record<EdgeKind, [string, string]> = {
  funds: ["b", "t"], approve: ["b", "t"], gov: ["sl", "r"], bus: ["b", "t"], hold: ["hold", "l"], decl: ["db", "bt"], pay: ["b", "t"],
};

export function toReactFlow(snap: GraphSnapshot, boxes: Record<string, TweenBox>, v: ViewState, principalLabels?: Record<string, string>): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const hlNodes = new Set(v.highlight.nodeIds), hlEdges = new Set(v.highlight.edgeIds);
  const anyRed = v.redNodes.size > 0;
  const flaggedD = v.flagged;
  const label = (pid: string) => principalLabels?.[pid] ?? snap.districts.find((d) => d.principalId === pid)?.label ?? pid;
  const nodeById = new Map(snap.nodes.map((n) => [n.id, n]));
  const dim = (id: string) => v.dimUnreached && anyRed && !v.redNodes.has(id) && id !== "treasury";

  // who (declared) controls a key -> small "tự khai" tag + panel text
  // live backend points declared edges at a principal (p:x); mock points at its key. Draw both onto the key node.
  const declTo = (to: string) => { const k = to.startsWith("p:") ? snap.districts.find((d) => `p:${d.principalId}` === to)?.keys[0] : undefined; return k ? `k:${k}` : to; };
  const declaredBy = new Map<string, string>();
  for (const e of snap.edges) if (e.source !== "onchain" && (e.type === "CONTROLS" || e.type === "ADMINS")) declaredBy.set(declTo(e.to), e.from.replace(/^p:/, ""));

  // districts first (render under keys)
  for (const d of snap.districts) {
    const id = `p:${d.principalId}`, b = boxes[id];
    if (!b) continue;
    const keyCapSum = d.keys.reduce((s, k) => s + m(nodeById.get(`k:${k}`)?.data.keyDailyCap), 0n);
    const data: DistrictData = {
      principalId: d.principalId, label: d.label, kind: d.kind, dailyCap: d.dailyCap, spentToday: d.spentToday, locked: d.locked, keyCount: d.keys.length,
      keyCapSum: keyCapSum.toString(), flagged: flaggedD.has(d.principalId), red: v.redNodes.has(id), origin: v.origins.has(d.principalId),
      amber: hlNodes.has(id), selected: v.selectedId === id, dim: dim(id), o: b.o, w: b.w, h: b.h, compact: v.mode === "simulate",
    };
    nodes.push({ id, type: "district", position: { x: b.x, y: b.y }, data, width: b.w, height: b.h, zIndex: 0, style: { pointerEvents: b.o < 0.1 ? "none" : undefined }, draggable: false, selectable: false, connectable: false });
  }
  for (const n of snap.nodes) {
    const b = boxes[n.id];
    if (!b || !isVisibleNode(n, v.mode, v.showMarket)) continue;
    if (n.type === "Principal") continue;
    if (n.type === "Key") {
      const data: KeyData = {
        keyId: n.id.replace(/^k:/, ""), label: n.label, kind: n.data.kind ?? "HUMAN", active: n.data.active !== false, locked: !!n.data.locked,
        cap: n.data.keyDailyCap, spent: n.data.keySpentToday, declaredBy: declaredBy.has(n.id) ? label(declaredBy.get(n.id)!) : null,
        red: v.redNodes.has(n.id), amber: hlNodes.has(n.id), selected: v.selectedId === n.id, dim: dim(n.id), o: b.o, w: b.w, h: b.h,
      };
      nodes.push({ id: n.id, type: "key", position: { x: b.x, y: b.y }, data, width: b.w, height: b.h, zIndex: 10, style: { pointerEvents: b.o < 0.1 ? "none" : undefined }, draggable: false, selectable: false, connectable: false });
      continue;
    }
    const data: EntityData = {
      type: n.type, label: n.label, balance: n.data.balance, paused: n.data.paused as boolean | undefined, red: v.redNodes.has(n.id),
      amber: hlNodes.has(n.id), selected: v.selectedId === n.id, dim: dim(n.id), o: b.o, w: b.w, h: b.h,
      sub: n.type === "Member" && n.data.principalId ? "cũng giữ khu" : undefined,
    };
    nodes.push({ id: n.id, type: "entity", position: { x: b.x, y: b.y }, data, width: b.w, height: b.h, zIndex: 10, style: { pointerEvents: b.o < 0.1 ? "none" : undefined }, draggable: false, selectable: false, connectable: false });
  }

  // ---- edges
  const edges: Edge[] = [];
  const present = (id: string) => nodes.some((n) => n.id === id);
  const push = (id: string, from: string, to: string, kind: EdgeKind, source: EdgeSource, type?: EdgeType, extra: Partial<FlowEdgeData> = {}) => {
    if (!present(from) || !present(to)) return;
    const red = v.redEdges.has(id), amber = hlEdges.has(id) && !red;
    const o = Math.min(boxes[from]?.o ?? 1, boxes[to]?.o ?? 1);
    const data: FlowEdgeData = {
      kind, source, type, tone: red ? "red" : amber ? "amber" : "idle", active: red || amber || v.selectedId === from || v.selectedId === to, o,
      dim: v.dimUnreached && anyRed && !red, ...extra,
    };
    const [sh, th] = kind === "funds" && v.mode === "simulate" ? ["sr", "l"] : HANDLES[kind];
    edges.push({ id, source: from, target: to, sourceHandle: sh, targetHandle: th, type: "flow", data, zIndex: red || amber ? 20 : 1, selectable: false, focusable: false });
  };
  const declTargets = snap.edges.filter((e) => KIND_OF_EDGE(e) === "decl" && e.source !== "onchain").map((e) => declTo(e.to));
  const laneOf = (to: string) => [...new Set(declTargets)].sort((a, b) => (boxes[a]?.x ?? 0) - (boxes[b]?.x ?? 0)).indexOf(to);
  for (const e of snap.edges) {
    const kind = KIND_OF_EDGE(e);
    if (!kind) continue;
    if (kind === "pay" && !(v.mode === "map" && v.showMarket)) continue;
    if (kind === "approve" && v.mode !== "map") continue;
    // a declared edge inside the district that already holds the key on-chain adds nothing visually
    if (kind === "decl") {
      const key = nodeById.get(declTo(e.to));
      const owner = key?.data.principalId;
      if (owner && e.from === `p:${owner}`) continue;
    }
    push(e.id, e.from, kind === "decl" ? declTo(e.to) : e.to, kind, e.source, e.type, e.source !== "onchain" && kind === "decl" ? { label: "tự khai", lane: laneOf(e.to) } : {});
  }
  for (const d of snap.districts) push(busEdgeId(d.principalId), "vault", `p:${d.principalId}`, "bus", "onchain");
  if (v.mode === "map") push("x:council-vault", "council", "vault", "gov", "onchain");
  return { nodes, edges };
}
