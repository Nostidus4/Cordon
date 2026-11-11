// Custom edge. Style encodes provenance (spec §10.2): solid = on-chain, dashed = tự khai (declared), dotted = suy luận (inferred);
// FUNDS flow animates; red = spread by the simulation; amber = pointed at by the assistant.
import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";
import { motion } from "framer-motion";
import type { FlowEdgeData } from "../../graph/toReactFlow";

const COLOR = { onchain: "rgb(150 162 255 / 0.5)", bus: "rgb(150 162 255 / 0.2)", funds: "#4cc9f0", declared: "#b79bff", inferred: "#8189b4", red: "#ff6b7a", amber: "#ffbf3c" };

function FlowEdgeImpl({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<Edge<FlowEdgeData>>) {
  const d = data!;
  let path: string, lx = (sourceX + targetX) / 2, ly = (sourceY + targetY) / 2;
  if (d.kind === "hold") {
    const r = 7;
    path = `M ${sourceX} ${sourceY} V ${targetY - r} Q ${sourceX} ${targetY} ${sourceX + r} ${targetY} H ${targetX}`;
  } else if (d.kind === "decl") {
    // declared edges run in lanes under the districts and rise into the bottom of the key (nearest target = lane 0)
    const r = 9, lane = Math.max(sourceY, targetY) + 24 + (d.lane ?? 0) * 12, dx = Math.sign(targetX - sourceX) || 1;
    path = Math.abs(targetX - sourceX) < 2 * r
      ? `M ${sourceX} ${sourceY} V ${targetY}`
      : `M ${sourceX} ${sourceY} V ${lane - r} Q ${sourceX} ${lane} ${sourceX + dx * r} ${lane} H ${targetX - dx * r} Q ${targetX} ${lane} ${targetX} ${lane - r} V ${targetY}`;
    lx = targetX; ly = (lane + targetY) / 2 + 2;
  } else if (d.kind === "pay") {
    [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, curvature: 0.42 });
  } else {
    [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 18, offset: 22 });
  }
  const red = d.tone === "red", amber = d.tone === "amber";
  const base = d.kind === "funds" ? COLOR.funds : d.kind === "bus" || d.kind === "gov" ? COLOR.bus : d.source === "declared" ? COLOR.declared : d.source === "inferred" ? COLOR.inferred : COLOR.onchain;
  const dash = d.source === "declared" ? "7 6" : d.source === "inferred" ? "1.5 6" : undefined;
  const width = d.kind === "funds" ? 2.4 : d.kind === "bus" ? 1.4 : d.kind === "decl" ? 2 : 1.6;
  const boost = d.active && !red && !amber ? 0.85 : 1;
  return (
    <g style={{ opacity: d.o * (d.dim ? 0.25 : 1), transition: "opacity .3s" }}>
      <BaseEdge id={id} path={path} style={{ stroke: base, strokeWidth: width * boost, strokeDasharray: dash, strokeLinecap: d.source === "inferred" ? "round" : "butt", opacity: red ? 0.25 : 1 }} />
      {d.kind === "funds" ? <path d={path} fill="none" stroke="#bff0ff" strokeWidth={2.4} className="gv-edge-flow" style={{ opacity: 0.9 }} /> : null}
      {amber ? <path d={path} fill="none" stroke={COLOR.amber} strokeWidth={3.2} strokeDasharray={dash} style={{ filter: "drop-shadow(0 0 6px rgb(255 191 60 / 0.8))" }} /> : null}
      {red ? (
        <>
          <motion.path key="red" d={path} fill="none" stroke={COLOR.red} strokeWidth={3} strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.3, ease: "easeOut" }} style={{ filter: "drop-shadow(0 0 7px rgb(255 107 122 / 0.9))" }} />
          <path d={path} fill="none" stroke="#ffd0d5" strokeWidth={1.6} className="gv-edge-flow" style={{ opacity: 0.85 }} />
        </>
      ) : null}
      {d.label ? (
        <EdgeLabelRenderer>
          <span style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`, opacity: d.o * (d.dim ? 0.3 : 1) }}
            className={`pointer-events-none absolute rounded-full border border-dashed px-1.5 py-px text-[10px] font-semibold leading-4 ${red ? "border-bad/70 bg-[#2a1020] text-bad" : "border-sim/60 bg-[#1a1540] text-sim"}`}>
            {red ? "✕ " : "◇ "}{d.label}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </g>
  );
}
export const FlowEdge = memo(FlowEdgeImpl);
