// District group node: a bordered box with the district badge (shared cap or "không có cổng chung"), spent today, flag / lock state.
import { memo } from "react";
import { motion } from "framer-motion";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { AnimatedNumber, cn } from "../ui";
import { fmtDisplay } from "../../lib/format";
import type { DistrictData } from "../../graph/toReactFlow";
import { useGraphActions } from "./context";
import { KIND_ICON } from "./KeyNode";

function Spent({ spent, cap, locked }: { spent: bigint; cap: bigint; locked: boolean }) {
  const pct = cap === 0n ? 0 : Math.min(100, Number((spent * 1000n) / cap) / 10);
  const st = locked ? "lock" : pct >= 100 ? "bad" : pct >= 80 ? "warn" : "ok";
  const glyph = locked ? "◐ " : pct >= 100 ? "✕ " : pct >= 80 ? "▲ " : "";
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] leading-none">
        <span className="text-faint">Đã chi hôm nay</span>
        <span className={cn("tnum", st === "ok" ? "text-muted" : st === "warn" ? "font-semibold text-warn" : st === "bad" ? "font-semibold text-bad" : "text-lock")}>{glyph}<b className="text-text">{fmtDisplay(spent)}</b> / {fmtDisplay(cap)}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/8">
        <motion.div className={cn("h-full rounded-full", st === "ok" ? "bg-ok" : st === "warn" ? "bg-warn" : st === "bad" ? "bg-bad" : "bg-lock")} initial={false} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 90, damping: 18 }} />
      </div>
    </div>
  );
}

function DistrictImpl({ id, data: d }: NodeProps<Node<DistrictData>>) {
  const { select } = useGraphActions();
  const Icon = KIND_ICON[d.kind];
  const keyCap = BigInt(d.keyCapSum);
  const cap = d.dailyCap ? BigInt(d.dailyCap.raw) : keyCap;
  const capNumber = d.dailyCap ? Number(BigInt(d.dailyCap.raw) / 1_000_000n) : 0;
  return (
    <div
      role="button" tabIndex={0}
      aria-label={`Khu ${d.label}: ${d.dailyCap ? `hạn mức chung ${d.dailyCap.display} mỗi ngày` : "không có cổng chung"}${d.flagged ? ", có cờ vàng" : ""}${d.locked ? ", đã khoá" : ""}${d.origin ? ", bị chiếm" : ""}`}
      onClick={(e) => { e.stopPropagation(); select(id); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(id); } }}
      style={{ width: d.w, height: d.h, opacity: d.o * (d.dim ? 0.42 : 1) }}
      className={cn(
        "relative rounded-[18px] border bg-[rgb(17_22_58/0.62)] outline-none backdrop-blur-[2px] transition-[border-color,background,opacity,box-shadow] duration-300",
        "border-line-strong hover:border-brand/60 focus-visible:ring-2 focus-visible:ring-accent",
        d.flagged && !d.red && "border-warn/60 gv-flag",
        d.locked && "border-lock/60 bg-[rgb(30_34_60/0.7)]",
        d.red && "border-bad/70 bg-[rgb(58_20_36/0.45)]",
        d.origin && "gv-origin border-bad",
        d.amber && "gv-amber",
        d.selected && !d.origin && "border-brand ring-2 ring-brand/70",
      )}
    >
      <Handle id="t" type="target" position={Position.Top} />
      <Handle id="hold" type="source" position={Position.Left} style={{ left: 8, top: d.compact ? 82 : 114 }} />
      <Handle id="db" type="source" position={Position.Bottom} />
      {d.locked ? <div className="gv-hatch pointer-events-none absolute inset-0 rounded-[18px]" aria-hidden /> : null}

      {d.origin ? <Tab tone="bad">✕ bị chiếm</Tab> : d.locked ? <Tab tone="lock">◐ đã khoá</Tab> : d.red ? <Tab tone="bad">✕ bị lộ</Tab> : d.flagged ? <Tab tone="warn">▲ cờ vàng</Tab> : null}

      <div className="relative px-3.5 pt-3">
        <div className="flex h-9 items-center gap-2">
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", d.origin ? "bg-bad/30 text-bad" : "bg-white/10 text-muted")}><Icon className="size-4.5" aria-hidden /></span>
          <p className="line-clamp-2 flex-1 text-[14px] font-bold leading-[1.15] text-text">{d.label}</p>
        </div>
        <div className="mt-2">
          {d.dailyCap ? (
            <p className="inline-flex items-center gap-1 rounded-md border border-ok/35 bg-ok-soft px-1.5 py-0.5 text-[11.5px] font-semibold text-ok">
              <span aria-hidden>✓</span> Hạn mức chung <AnimatedNumber value={capNumber} from={0} duration={1.2} />/ngày
            </p>
          ) : (
            <p className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11.5px] font-semibold", d.flagged ? "border-warn/45 bg-warn-soft text-warn" : "border-line bg-white/5 text-muted")}>
              <span aria-hidden>{d.flagged ? "▲" : "○"}</span> không có cổng chung
            </p>
          )}
        </div>
        {d.compact ? null : <div className="mt-2.5"><Spent spent={BigInt(d.spentToday.raw)} cap={cap > 0n ? cap : 1n} locked={d.locked} /></div>}
      </div>
    </div>
  );
}

function Tab({ tone, children }: { tone: "bad" | "warn" | "lock"; children: React.ReactNode }) {
  return <span className={cn("absolute -top-2.5 right-3 z-10 rounded-full border px-2 py-0.5 text-[10.5px] font-bold leading-4", tone === "bad" && "border-bad/60 bg-[#3a1424] text-bad", tone === "warn" && "border-warn/60 bg-[#33280c] text-warn", tone === "lock" && "border-lock/60 bg-[#20253f] text-lock")}>{children}</span>;
}
export const DistrictGroupNode = memo(DistrictImpl);
