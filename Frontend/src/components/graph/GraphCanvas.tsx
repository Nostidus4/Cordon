// The permission-graph canvas, shared by Map and Simulate ("simulate mode" = red spreads, driven from outside via redNodes/redEdges).
// Fixed precomputed layout (no dragging), animated re-layout, smooth camera, keyboard-accessible nodes.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Background, BackgroundVariant, ReactFlow, ReactFlowProvider, useReactFlow, useStore, type Edge, type Node } from "@xyflow/react";
import { Maximize2, Minus, Plus } from "lucide-react";
import type { GraphSnapshot } from "../../types";
import { computeLayout, boundsOf, type Box, type LayoutMode } from "../../graph/layout";
import { toReactFlow, type Highlight } from "../../graph/toReactFlow";
import { IconButton, cn } from "../ui";
import "./graph.css";
import { GraphActionsContext } from "./context";
import { DistrictGroupNode } from "./DistrictGroupNode";
import { EntityNode } from "./EntityNode";
import { FlowEdge } from "./FlowEdge";
import { KeyNode } from "./KeyNode";
import { useTweenedBoxes } from "./useTweenedBoxes";

const nodeTypes = { district: DistrictGroupNode, key: KeyNode, entity: EntityNode };
const edgeTypes = { flow: FlowEdge };
const EMPTY_SET: Set<string> = new Set();
const NO_HL: Highlight = { nodeIds: [], edgeIds: [] };

export interface GraphCanvasProps {
  snapshot: GraphSnapshot;
  mode?: LayoutMode;
  showMarket?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** amber outline, pushed by the assistant */
  highlight?: Highlight;
  /** principal ids carrying a HIGH finding */
  flagged?: Set<string>;
  redNodes?: Set<string>;
  redEdges?: Set<string>;
  origins?: Set<string>;
  dimUnreached?: boolean;
  /** camera follows these node ids (smooth zoom); null/empty = fit the whole graph */
  focusIds?: string[] | null;
  /** default camera frames only these node ids (plus treasury and vault) instead of the whole graph; the rest stays in the world, just off-screen */
  fitIds?: string[] | null;
  /** px kept free around the graph for overlay panels when fitting the camera */
  insetRight?: number;
  insetLeft?: number;
  insetTop?: number;
  insetBottom?: number;
  /** where the zoom buttons sit (they move left of an open side panel) */
  controlsClassName?: string;
  className?: string;
  children?: React.ReactNode;
}
const FIT_MAX_ZOOM = 1.05;

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

function Inner({ snapshot, mode = "map", showMarket = false, selectedId = null, onSelect, highlight = NO_HL, flagged = EMPTY_SET, redNodes = EMPTY_SET, redEdges = EMPTY_SET, origins = EMPTY_SET, dimUnreached = false, focusIds = null, fitIds = null, insetRight = 0, insetLeft = 0, insetTop = 0, insetBottom = 0, controlsClassName, className, children }: GraphCanvasProps) {
  const rf = useReactFlow();
  const width = useStore((s) => s.width), height = useStore((s) => s.height);
  const layout = useMemo(() => computeLayout(snapshot, { mode, showMarket }), [snapshot, mode, showMarket]);
  const { boxes } = useTweenedBoxes(layout.boxes, layout.signature);

  // remember every node/district ever seen so nodes that disappear (e.g. empty districts after policy v2) can fade out as ghosts
  const known = useRef({ nodes: new Map<string, GraphSnapshot["nodes"][number]>(), districts: new Map<string, GraphSnapshot["districts"][number]>() });
  for (const n of snapshot.nodes) known.current.nodes.set(n.id, n);
  for (const d of snapshot.districts) known.current.districts.set(`p:${d.principalId}`, d);
  const renderSnap = useMemo(() => {
    const ids = new Set(snapshot.nodes.map((n) => n.id));
    const dids = new Set(snapshot.districts.map((d) => `p:${d.principalId}`));
    const ghostNodes = [...known.current.nodes.values()].filter((n) => !ids.has(n.id) && boxes[n.id]);
    const ghostDistricts = [...known.current.districts.entries()].filter(([id]) => !dids.has(id) && boxes[id]).map(([, d]) => d);
    return ghostNodes.length || ghostDistricts.length ? { ...snapshot, nodes: [...snapshot.nodes, ...ghostNodes], districts: [...snapshot.districts, ...ghostDistricts] } : snapshot;
  }, [snapshot, boxes]);

  const { nodes, edges } = useMemo(() => toReactFlow(renderSnap, boxes, {
    mode, showMarket, selectedId, highlight, flagged, redNodes, redEdges, origins, dimUnreached,
  }), [renderSnap, boxes, mode, showMarket, selectedId, highlight, flagged, redNodes, redEdges, origins, dimUnreached]);

  const fitTo = useCallback((rect: Box, opts: { duration: number; maxZoom?: number; padding?: number }) => {
    if (!width || !height) return;
    const pad = opts.padding ?? 28;
    const innerW = Math.max(200, width - insetLeft - insetRight), innerH = Math.max(160, height - insetTop - insetBottom);
    const zoom = Math.max(0.25, Math.min(opts.maxZoom ?? FIT_MAX_ZOOM, (innerW - 2 * pad) / rect.w, (innerH - 2 * pad) / rect.h));
    const x = insetLeft + (innerW - rect.w * zoom) / 2 - rect.x * zoom;
    const y = insetTop + (innerH - rect.h * zoom) / 2 - rect.y * zoom;
    void rf.setViewport({ x, y, zoom }, { duration: opts.duration });
  }, [rf, width, height, insetLeft, insetRight, insetTop, insetBottom]);

  // camera: whole graph in view (no animation on mount), or the focused nodes; re-run when layout / container / focus changes
  const [nonce, setNonce] = useState(0);
  const fitted = useRef(false);
  const lastKey = useRef("");
  const focusKey = (focusIds ?? []).join(",") + "|" + (fitIds ?? []).join(",");
  const frame = useMemo(() => {
    const ids = (fitIds ?? []).filter((i) => layout.boxes[i]);
    if (!ids.length) return layout.bounds;
    return boundsOf(Object.fromEntries([...new Set([...ids, "treasury", "vault"])].filter((i) => layout.boxes[i]).map((i) => [i, layout.boxes[i]])));
  }, [fitIds, layout]);
  useEffect(() => {
    if (!width || !height) return;
    const ids = (focusIds ?? []).filter((i) => layout.boxes[i]);
    // animate only when what we look at changes (layout / focus), never for plain container resizes
    const key = `${layout.signature}#${focusKey}#${nonce}`;
    const dur = fitted.current && key !== lastKey.current ? 850 : 0;
    lastKey.current = key;
    if (ids.length) fitTo(boundsOf(Object.fromEntries(ids.map((i) => [i, layout.boxes[i]]))), { duration: dur, maxZoom: 1.0, padding: 60 });
    else fitTo(frame, { duration: dur, padding: mode === "simulate" ? 24 : 30 });
    fitted.current = true;
  }, [layout.signature, width, height, insetLeft, insetRight, insetTop, insetBottom, focusKey, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const actions = useMemo(() => ({ select: (id: string) => onSelect?.(id) }), [onSelect]);

  return (
    <GraphActionsContext.Provider value={actions}>
      <div className={cn("relative size-full", className)}>
        <ReactFlow
          className="gv-flow-root" nodes={nodes as Node[]} edges={edges as Edge[]} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} nodesFocusable={false} edgesFocusable={false}
          zoomOnScroll={false} panOnScroll={false} preventScrolling={false} zoomOnDoubleClick={false}
          minZoom={0.25} maxZoom={1.6} defaultViewport={{ x: 0, y: 0, zoom: 0.8 }} proOptions={{ hideAttribution: true }}
          onPaneClick={() => onSelect?.(null)} onlyRenderVisibleElements={false}
        >
          <Background variant={BackgroundVariant.Dots} gap={26} size={1.2} color="rgb(148 160 255 / 0.16)" />
        </ReactFlow>
        <div className={cn("absolute right-3 top-3 z-20 flex gap-0.5 rounded-xl border border-line bg-[#0b1030]/80 p-0.5 backdrop-blur transition-[right] duration-300", controlsClassName)}>
          <IconButton size="sm" label="Phóng to" icon={<Plus className="size-4" />} onClick={() => void rf.zoomIn({ duration: 250 })} />
          <IconButton size="sm" label="Thu nhỏ" icon={<Minus className="size-4" />} onClick={() => void rf.zoomOut({ duration: 250 })} />
          <IconButton size="sm" label="Vừa khung hình (F)" icon={<Maximize2 className="size-3.5" />} onClick={() => { onSelect?.(null); setNonce((n) => n + 1); }} />
        </div>
        {children}
      </div>
    </GraphActionsContext.Provider>
  );
}
