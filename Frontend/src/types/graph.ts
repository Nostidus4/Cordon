// GraphSnapshot (spec §8.3). Ids: principal `p:<id>`, key `k:<id>`, recipient `r:<id>`, protocol `pr:<id>`, token `t:<sym>`,
// member `m:<id>`; singletons `treasury`, `vault`, `council`. Key ids are `key_minh`, ... (also used in District.keys / SimResult).
import type { EdgeSource, EdgeType, KeyKind, Money, NodeType } from "./common";

export interface NodeData {
  principalId?: string;
  kind?: KeyKind;
  address?: string;
  active?: boolean;
  locked?: boolean;
  /** Key: card daily cap / spent today */
  keyDailyCap?: Money;
  keySpentToday?: Money;
  /** Principal: shared cap (null = "không có cổng chung") */
  dailyCap?: Money | null;
  spentToday?: Money;
  balance?: Money;
  [k: string]: unknown;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  data: NodeData;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  type: EdgeType;
  source: EdgeSource;
  note?: string;
}

export interface District {
  principalId: string;
  label: string;
  kind: KeyKind;
  dailyCap: Money | null;
  spentToday: Money;
  locked: boolean;
  keys: string[];
}

export interface GraphSnapshot {
  version: number;
  policyVersion: number;
  block: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
  districts: District[];
}
