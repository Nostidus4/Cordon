import { motion } from "framer-motion";
import type { Money } from "../../types";
import { fmtDisplay, fmtPercent, percentOf } from "../../lib/format";
import { cn } from "./cn";
import { STATUS_GLYPH, type Status } from "./StatusChip";

const toBig = (v: Money | bigint) => (typeof v === "bigint" ? v : BigInt(v.raw));
const barColor: Record<Status, string> = { ok: "bg-ok", warn: "bg-warn", bad: "bg-bad", locked: "bg-lock", info: "bg-brand" };

export interface CapBarProps {
  label?: string;
  value: Money | bigint; // base units
  cap: Money | bigint;
  /** force a status; otherwise derived: <80% ok · >=80% warn (▲ gần trần) · 100% bad (✕ hết hạn mức) */
  status?: Status;
  locked?: boolean;
  caption?: string;
  height?: "sm" | "md" | "lg";
  /** thin tick marks (e.g. each card's contribution) */
  className?: string;
}

/** Animated cap bar with labels. Value must come from the event (principalSpentAfter), never summed client-side (spec §10.5). */
export function CapBar({ label, value, cap, status, locked, caption, height = "md", className }: CapBarProps) {
  const v = toBig(value), c = toBig(cap);
  const pct = c === 0n ? 0 : Math.min(100, percentOf(v, c));
  const st: Status = locked ? "locked" : status ?? (pct >= 100 ? "bad" : pct >= 80 ? "warn" : "ok");
  const note = locked ? "đã khoá" : pct >= 100 ? "hết hạn mức" : pct >= 80 ? "gần trần" : null;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="font-medium text-text">{label}</span>
        <span className="tnum text-muted">
          <b className="text-text">{fmtDisplay(v)}</b> / {fmtDisplay(c)}
          <span className="text-faint"> · {fmtPercent(pct, 0)}</span>
          {note ? <span className={cn("ml-2 font-semibold", st === "warn" ? "text-warn" : st === "bad" ? "text-bad" : "text-lock")}><span aria-hidden>{STATUS_GLYPH[st]}</span> {note}</span> : null}
        </span>
      </div>
      <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label ?? "Hạn mức"}
        className={cn("relative w-full overflow-hidden rounded-full bg-white/8", height === "sm" ? "h-1.5" : height === "md" ? "h-2.5" : "h-4")}>
        <motion.div className={cn("h-full rounded-full", barColor[st], st === "bad" && "shadow-[0_0_14px_var(--color-bad)]")}
          initial={false} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 90, damping: 18 }} />
        {st === "locked" ? <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(255_255_255/0.08)_6px_12px)]" /> : null}
      </div>
      {caption ? <p className="mt-1 text-xs text-faint">{caption}</p> : null}
    </div>
  );
}
