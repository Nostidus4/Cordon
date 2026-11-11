// Treasury / Vault / Council / Member / Recipient / Protocol / Token nodes.
import { memo } from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Coins, Landmark, Repeat2, Store, UserRound, Users, Vault } from "lucide-react";
import type { NodeType } from "../../types";
import type { EntityData } from "../../graph/toReactFlow";
import { cn } from "../ui";
import { useGraphActions } from "./context";

const ICON: Partial<Record<NodeType, typeof Coins>> = { Treasury: Landmark, Vault, Council: Users, Member: UserRound, Recipient: Store, Protocol: Repeat2, Token: Coins };
const BLURB: Partial<Record<NodeType, string>> = { Treasury: "Quỹ gốc của công ty", Vault: "Chỉ chi qua hạn mức", Council: "2 trên 3 người duyệt" };

function EntityImpl({ id, data: d }: NodeProps<Node<EntityData>>) {
  const { select } = useGraphActions();
  const Icon = ICON[d.type] ?? Coins;
  const big = d.type === "Treasury" || d.type === "Vault" || d.type === "Council";
  return (
    <div
      role="button" tabIndex={0} aria-label={d.label}
      onClick={(e) => { e.stopPropagation(); select(id); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(id); } }}
      style={{ width: d.w, height: d.h, opacity: d.o * (d.dim ? 0.55 : 1) }}
      className={cn(
        "relative flex items-center gap-3 rounded-2xl border px-3.5 outline-none transition-[border-color,background,opacity,box-shadow] duration-300 focus-visible:ring-2 focus-visible:ring-accent",
        big ? "border-line-strong bg-[linear-gradient(160deg,rgb(139_124_246/0.22),rgb(24_30_74/0.85))] shadow-[var(--shadow-card)]" : "border-line bg-[#12173f]/90",
        d.type === "Treasury" && "border-brand/55",
        d.red && "border-bad shadow-[var(--shadow-glow-bad)]",
        d.amber && "gv-amber",
        d.selected && "border-brand ring-2 ring-brand/70",
        "hover:border-brand/60",
      )}
    >
      <Handle id="t" type="target" position={Position.Top} />
      <Handle id="l" type="target" position={Position.Left} />
      <Handle id="r" type="target" position={Position.Right} />
      <Handle id="b" type="source" position={Position.Bottom} />
      <Handle id="sl" type="source" position={Position.Left} />
      <Handle id="sr" type="source" position={Position.Right} />
      <span className={cn("grid shrink-0 place-items-center rounded-xl", big ? "size-10 bg-white/10 text-[#d6d1ff]" : "size-8 bg-white/8 text-muted")}><Icon className={big ? "size-5" : "size-4"} aria-hidden /></span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className={cn("block truncate font-semibold text-text", big ? "text-[14px]" : "text-[12.5px]")}>{d.label}</span>
        {d.balance ? (
          <span className="mt-0.5 block text-[12px] text-muted"><b className="tnum text-[15px] font-bold text-text">{d.balance.display}</b> <span className="text-faint">tUSDC</span></span>
        ) : d.sub ? <span className="block truncate text-[10.5px] text-warn">▲ {d.sub}</span> : BLURB[d.type] ? <span className="block text-[11px] text-faint">{BLURB[d.type]}</span> : null}
        {d.type === "Vault" && d.paused ? <span className="block text-[11px] font-semibold text-bad">✕ đang tạm dừng</span> : null}
      </span>
    </div>
  );
}
export const EntityNode = memo(EntityImpl);
