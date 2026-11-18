// GraphSnapshot + layout boxes + spread state -> React Flow nodes/edges for the "who gets exposed" graph (simulate layout only). Pure.
import type { Edge, Node } from "@xyflow/react";
import type { EdgeSource, GraphEdge, GraphSnapshot, KeyKind, Money, NodeType } from "../types";
import type { Box } from "./layout";
import { busEdgeId } from "./spread";

export interface ViewState {
  /** node ids / edge ids currently red (spread so far) */
  redNodes: Set<string>;
  redEdges: Set<string>;
  /** compromised principal ids (origin of the spread) */
  origins: Set<string>;
}
export interface DistrictData extends Record<string, unknown> {
  principalId: string; label: string; kind: KeyKind; dailyCap: Money | null; locked: boolean; red: boolean; origin: boolean; dim: boolean; w: number; h: number;
}
export interface KeyData extends Record<string, unknown> {
  ownerId: string | null; label: string; kind: KeyKind; active: boolean; locked: boolean; cap?: Money; declaredBy: string | null; red: boolean; dim: boolean; w: number; h: number;
}
export interface EntityData extends Record<string, unknown> {
  type: NodeType; label: string; balance?: Money; red: boolean; dim: boolean; w: number; h: number;
}
export type EdgeKind = "funds" | "bus" | "hold" | "decl";
export interface FlowEdgeData extends Record<string, unknown> {
  kind: EdgeKind; source: EdgeSource; lane?: number; tone: "idle" | "red"; dim: boolean; label?: string;
}

const kindOf = (e: GraphEdge): EdgeKind | null => (e.type === "FUNDS" ? "funds" : e.type === "HOLDS_KEY" ? "hold" : e.type === "CONTROLS" || e.type === "ADMINS" ? "decl" : null);
const HANDLES: Record<EdgeKind, [string, string]> = { funds: ["sr", "l"], bus: ["b", "t"], hold: ["hold", "l"], decl: ["db", "bt"] };
const nodeProps = { draggable: false, selectable: false, connectable: false } as const;

export function toReactFlow(snap: GraphSnapshot, boxes: Record<string, Box>, v: ViewState): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const anyRed = v.redNodes.size > 0;
  const dim = (id: string) => anyRed && !v.redNodes.has(id) && id !== "treasury";
  const nodeById = new Map(snap.nodes.map((n) => [n.id, n]));
  const labelOf = (pid: string) => snap.districts.find((d) => d.principalId === pid)?.label ?? pid;

  // live backend points declared edges at a principal (p:x); mock points at its key. Draw both onto the key node.
  const declTo = (to: string) => { const k = to.startsWith("p:") ? snap.districts.find((d) => `p:${d.principalId}` === to)?.keys[0] : undefined; return k ? `k:${k}` : to; };
  const declaredBy = new Map<string, string>();
  for (const e of snap.edges) if (e.source !== "onchain" && (e.type === "CONTROLS" || e.type === "ADMINS")) declaredBy.set(declTo(e.to), e.from.replace(/^p:/, ""));

  for (const d of snap.districts) {
    const id = `p:${d.principalId}`, b = boxes[id];
    if (!b) continue;
    const data: DistrictData = { principalId: d.principalId, label: d.label, kind: d.kind, dailyCap: d.dailyCap, locked: d.locked, red: v.redNodes.has(id), origin: v.origins.has(d.principalId), dim: dim(id), w: b.w, h: b.h };
    nodes.push({ id, type: "district", position: { x: b.x, y: b.y }, data, width: b.w, height: b.h, zIndex: 0, ...nodeProps });
  }
  for (const n of snap.nodes) {
    const b = boxes[n.id];
    if (!b) continue;
    if (n.type === "Key") {
      const owner = typeof n.data.principalId === "string" ? n.data.principalId : null;
      const data: KeyData = {
        ownerId: owner, label: n.label, kind: n.data.kind ?? "HUMAN", active: n.data.active !== false, locked: !!n.data.locked, cap: n.data.keyDailyCap,
        declaredBy: declaredBy.has(n.id) ? labelOf(declaredBy.get(n.id)!) : null, red: v.redNodes.has(n.id), dim: dim(n.id), w: b.w, h: b.h,
      };
      nodes.push({ id: n.id, type: "key", position: { x: b.x, y: b.y }, data, width: b.w, height: b.h, zIndex: 10, ...nodeProps });
    } else if (n.type === "Treasury" || n.type === "Vault") {
      const data: EntityData = { type: n.type, label: n.label, balance: n.data.balance, red: v.redNodes.has(n.id), dim: dim(n.id), w: b.w, h: b.h };
      nodes.push({ id: n.id, type: "entity", position: { x: b.x, y: b.y }, data, width: b.w, height: b.h, zIndex: 10, ...nodeProps });
    }
  }

  const edges: Edge[] = [];
  const present = new Set(nodes.map((n) => n.id));
  const push = (id: string, from: string, to: string, kind: EdgeKind, source: EdgeSource, extra: Partial<FlowEdgeData> = {}) => {
    if (!present.has(from) || !present.has(to)) return;
    const red = v.redEdges.has(id);
    const data: FlowEdgeData = { kind, source, tone: red ? "red" : "idle", dim: anyRed && !red, ...extra };
    const [sh, th] = HANDLES[kind];
    edges.push({ id, source: from, target: to, sourceHandle: sh, targetHandle: th, type: "flow", data, zIndex: red ? 20 : 1, selectable: false, focusable: false });
  };
  const declTargets = [...new Set(snap.edges.filter((e) => kindOf(e) === "decl" && e.source !== "onchain").map((e) => declTo(e.to)))].sort((a, b) => (boxes[a]?.x ?? 0) - (boxes[b]?.x ?? 0));
  for (const e of snap.edges) {
    const kind = kindOf(e);
    if (!kind) continue;
    if (kind === "decl") {
      // a declared edge inside the district that already holds the key on-chain adds nothing visually
      const owner = nodeById.get(declTo(e.to))?.data.principalId;
      if (owner && e.from === `p:${owner}`) continue;
      push(e.id, e.from, declTo(e.to), kind, e.source, e.source !== "onchain" ? { label: "tự khai", lane: declTargets.indexOf(declTo(e.to)) } : {});
    } else push(e.id, e.from, e.to, kind, e.source);
  }
  for (const d of snap.districts) push(busEdgeId(d.principalId), "vault", `p:${d.principalId}`, "bus", "onchain");
  return { nodes, edges };
}
