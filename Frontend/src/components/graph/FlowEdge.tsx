// Custom edge. Solid = on-chain, dashed violet = tự khai (declared), teal = money flow; red = reached by the spread.
import { memo } from "react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Edge, type EdgeProps } from "@xyflow/react";
import type { FlowEdgeData } from "../../graph/toReactFlow";

export const FlowEdge = memo(function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data }: EdgeProps<Edge<FlowEdgeData>>) {
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
  } else {
    [path, lx, ly] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 18, offset: 22 });
  }
  const red = d.tone === "red";
  const base = d.kind === "funds" ? "var(--teal-d)" : d.kind === "bus" ? "#cdb98f" : d.source === "onchain" ? "#a79bc9" : "var(--violet)";
  return (
    <g style={{ opacity: d.dim ? 0.3 : 1, transition: "opacity .3s" }}>
      <BaseEdge id={id} path={path} style={{ stroke: base, strokeWidth: d.kind === "funds" ? 2.6 : d.kind === "bus" ? 1.6 : 2.2, strokeDasharray: d.source === "declared" ? "7 6" : undefined, opacity: red ? 0.3 : 1 }} />
      {red ? (
        <>
          <path d={path} fill="none" stroke="var(--red)" strokeWidth={3.4} strokeLinecap="round" />
          <path d={path} fill="none" stroke="#fff" strokeWidth={1.4} className="sg-flow" style={{ opacity: 0.8 }} />
        </>
      ) : null}
      {d.label ? (
        <EdgeLabelRenderer>
          <span style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`, position: "absolute", pointerEvents: "none", padding: "0 7px", borderRadius: 999, border: `1.5px dashed ${red ? "var(--red)" : "var(--violet)"}`, background: "#fff", fontSize: 10, lineHeight: "16px", fontWeight: 700, color: red ? "var(--red-ink)" : "var(--violet-d)", opacity: d.dim ? 0.4 : 1 }}>
            {red ? "✕ " : "◇ "}{d.label}
          </span>
        </EdgeLabelRenderer>
      ) : null}
    </g>
  );
});
