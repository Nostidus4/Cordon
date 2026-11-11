// Legend strip: line styles (provenance) and state glyphs. Horizontal so it never covers the graph.
import { cn } from "../ui";

function Line({ dash, color, label, flow }: { dash?: string; color: string; label: string; flow?: boolean }) {
  return (
    <li className="flex items-center gap-1.5 whitespace-nowrap">
      <svg width="28" height="8" aria-hidden className="shrink-0"><line x1="1" y1="4" x2="27" y2="4" stroke={color} strokeWidth="2.2" strokeDasharray={dash} strokeLinecap={dash === "1.5 6" ? "round" : "butt"} className={flow ? "gv-edge-flow" : undefined} /></svg>
      <span>{label}</span>
    </li>
  );
}
const G = ({ c, g, t }: { c: string; g: string; t: string }) => <li className="whitespace-nowrap"><span aria-hidden className={cn("mr-1 font-bold", c)}>{g}</span>{t}</li>;

export function Legend({ mode = "map", className }: { mode?: "map" | "simulate"; className?: string }) {
  return (
    <div role="group" aria-label="Chú giải" className={cn("glass flex max-w-[600px] flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl px-3.5 py-2 text-[11.5px] text-muted", className)}>
      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-faint">Chú giải</span>
      <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
        <Line color="rgb(150 162 255 / 0.8)" label="liền: trên chain" />
        <Line color="#b79bff" dash="7 6" label="đứt: tự khai" />
        {mode === "map" ? <Line color="#8189b4" dash="1.5 6" label="chấm: suy luận" /> : null}
        {mode === "map" ? <Line color="#4cc9f0" dash="5 9" flow label="dòng tiền" /> : null}
      </ul>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {mode === "map" ? <G c="text-warn" g="▲" t="cờ vàng" /> : null}
        {mode === "map" ? <G c="text-lock" g="◐" t="đã khoá" /> : null}
        {mode === "map" ? <G c="text-ok" g="✓" t="hạn mức chung" /> : null}
        {mode === "simulate" ? <G c="text-bad" g="✕" t="bị lộ" /> : null}
      </ul>
    </div>
  );
}
