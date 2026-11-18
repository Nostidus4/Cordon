// The permission graph for the Rủi ro tab: treasury -> vault -> districts -> keys, red spreads from the picked people. Fixed layout, fitted to its box (no overflow).
import { useEffect, useMemo, useRef } from "react";
import { ReactFlow, ReactFlowProvider, useReactFlow, useStore, type Edge, type Node } from "@xyflow/react";
import type { GraphSnapshot } from "../../types";
import { boundsOf, computeLayout } from "../../graph/layout";
import { toReactFlow } from "../../graph/toReactFlow";
import "./graph.css";
import { GraphActionsContext } from "./context";
import { FlowEdge } from "./FlowEdge";
import { DistrictNode, EntityNode, KeyNode } from "./nodes";

const nodeTypes = { district: DistrictNode, key: KeyNode, entity: EntityNode };
const edgeTypes = { flow: FlowEdge };
const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export interface SpreadGraphProps {
  snapshot: GraphSnapshot;
  redNodes: Set<string>;
  redEdges: Set<string>;
  origins: Set<string>;
  /** principals currently picked */
  picked: ReadonlySet<string>;
  onToggle: (principalId: string) => void;
  /** the camera frames only these node ids (plus treasury and vault); empty = whole graph */
  fitIds?: string[] | null;
}

export function SpreadGraph(props: SpreadGraphProps) {
  return <ReactFlowProvider><Inner {...props} /></ReactFlowProvider>;
}

function Inner({ snapshot, redNodes, redEdges, origins, picked, onToggle, fitIds }: SpreadGraphProps) {
  const rf = useReactFlow();
  const width = useStore((s) => s.width), height = useStore((s) => s.height);
  const layout = useMemo(() => computeLayout(snapshot, { mode: "simulate" }), [snapshot]);
  const { nodes, edges } = useMemo(() => toReactFlow(snapshot, layout.boxes, { redNodes, redEdges, origins }), [snapshot, layout, redNodes, redEdges, origins]);
  const actions = useMemo(() => ({ toggle: onToggle, picked }), [onToggle, picked]);

  const fitKey = (fitIds ?? []).join(",");
  const frame = useMemo(() => {
    const ids = [...new Set([...(fitIds ?? []).filter((i) => layout.boxes[i]), "treasury", "vault"])].filter((i) => layout.boxes[i]);
    const b = (fitIds ?? []).length ? boundsOf(Object.fromEntries(ids.map((i) => [i, layout.boxes[i]]))) : layout.bounds;
    return { ...b, h: b.h + 72 }; // declared edges run in lanes below the districts
  }, [fitKey, layout]); // eslint-disable-line react-hooks/exhaustive-deps
  const fitted = useRef(false);
  useEffect(() => {
    if (!width || !height) return;
    const pad = 20, top = 36;
    const zoom = Math.max(0.2, Math.min(1.1, (width - 2 * pad) / frame.w, (height - top - pad) / frame.h));
    const x = (width - frame.w * zoom) / 2 - frame.x * zoom;
    const y = top + (height - top - pad - frame.h * zoom) / 2 - frame.y * zoom;
    void rf.setViewport({ x, y, zoom }, { duration: fitted.current && !reduced() ? 500 : 0 });
    fitted.current = true;
  }, [rf, frame, width, height]);

  return (
    <GraphActionsContext.Provider value={actions}>
      <ReactFlow className="sg-root" nodes={nodes as Node[]} edges={edges as Edge[]} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} nodesFocusable={false} edgesFocusable={false}
        zoomOnScroll={false} panOnScroll={false} preventScrolling={false} zoomOnDoubleClick={false} panOnDrag={false}
        minZoom={0.2} maxZoom={1.6} defaultViewport={{ x: 0, y: 0, zoom: 0.6 }} proOptions={{ hideAttribution: true }} />
    </GraphActionsContext.Provider>
  );
}

/** Vietnamese legend under the graph. */
export function SpreadLegend() {
  return (
    <div className="sg-legend" role="group" aria-label="Chú giải">
      <span><i style={{ borderColor: "#a79bc9" }} aria-hidden />liền: có trên chain</span>
      <span><i style={{ borderColor: "var(--violet)", borderTopStyle: "dashed" }} aria-hidden />đứt: tự khai, chain không bảo đảm</span>
      <span><i style={{ borderColor: "var(--red)" }} aria-hidden />đỏ: kẻ xấu với tới</span>
      <span><i className="sw" style={{ borderColor: "var(--edge)", opacity: 0.5 }} aria-hidden />mờ: không với tới</span>
    </div>
  );
}
