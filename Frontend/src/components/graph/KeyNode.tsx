// Key (card) node: person / robot / server icon, daily cap, "tự khai" tag when its controller is only self-declared.
import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Bot, Server, User } from "lucide-react";
import type { KeyKind } from "../../types";
import type { KeyData } from "../../graph/toReactFlow";
import { cn } from "../ui";
import { useGraphActions } from "./context";

export const KIND_ICON: Record<KeyKind, typeof User> = { HUMAN: User, AGENT: Bot, SERVICE: Server };
export const KIND_TEXT: Record<KeyKind, string> = { HUMAN: "Người", AGENT: "Trợ lý AI", SERVICE: "Phần mềm" };

function KeyNodeImpl({ id, data: d }: NodeProps<Node<KeyData>>) {
  const { select } = useGraphActions();
  const Icon = KIND_ICON[d.kind];
  const inactive = !d.active;
  return (
    <div
      role="button" tabIndex={0} aria-label={`${d.label}${d.red ? ", bị ảnh hưởng" : ""}${d.declaredBy ? `, quản trị ${d.declaredBy} (tự khai)` : ""}`}
      onClick={(e) => { e.stopPropagation(); select(id); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(id); } }}
      style={{ width: d.w, height: d.h, opacity: d.o * (d.dim ? 0.38 : 1) }}
      className={cn(
        "relative flex items-center gap-2 rounded-xl border px-2 text-left outline-none transition-[background,border-color,opacity,box-shadow] duration-300",
        "bg-[#141a44] border-line-strong hover:border-brand/70 focus-visible:ring-2 focus-visible:ring-accent",
        d.locked && "gv-hatch border-lock/50 text-lock",
        inactive && "border-lock/50 bg-[#10142e] opacity-60",
        d.red && "border-bad bg-[#3a1424] shadow-[0_0_22px_-2px_rgb(255_107_122/0.55)] gv-key-hit",
        d.amber && "gv-amber",
        d.selected && !d.red && "border-brand ring-2 ring-brand/70 bg-[#1b2158]",
      )}
    >
      <Handle id="l" type="target" position={Position.Left} />
      <Handle id="t" type="target" position={Position.Top} />
      <Handle id="b" type="source" position={Position.Bottom} />
      <Handle id="bt" type="target" position={Position.Bottom} />
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", d.red ? "bg-bad/25 text-bad" : d.kind === "HUMAN" ? "bg-accent/15 text-accent" : d.kind === "AGENT" ? "bg-brand/25 text-[#c9c2ff]" : "bg-white/10 text-muted")}>
        <Icon className="size-4.5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className={cn("block text-[12.5px] font-semibold text-text", inactive && "line-through")} style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{d.label}</span>
        <span className={cn("mt-0.5 block truncate text-[11px] tnum", d.red ? "font-semibold text-bad" : inactive ? "text-lock" : "text-faint")}>
          {inactive ? "◐ đã gạch khỏi chain" : d.red ? `✕ lộ ${d.cap?.display ?? "?"}/ngày` : `trần ${d.cap?.display ?? "?"}/ngày`}
        </span>
      </span>
      {d.declaredBy ? (
        <span className="absolute -top-2.5 right-2 rounded-full border border-dashed border-sim/70 bg-[#1a1540] px-1.5 text-[9.5px] font-semibold leading-4 text-sim">◇ tự khai</span>
      ) : null}
    </div>
  );
}
export const KeyNode = memo(KeyNodeImpl);
