import type { ReactNode } from "react";
import { cn } from "./cn";

export type Status = "ok" | "warn" | "bad" | "locked" | "info";
/** Meaning is never color-only (spec §12): every status has a glyph + text. */
export const STATUS_GLYPH: Record<Status, string> = { ok: "✓", warn: "▲", bad: "✕", locked: "◐", info: "●" };
export const STATUS_TEXT_COLOR: Record<Status, string> = { ok: "text-ok", warn: "text-warn", bad: "text-bad", locked: "text-lock", info: "text-accent" };
const bg: Record<Status, string> = {
  ok: "bg-ok-soft border-ok/35 text-ok", warn: "bg-warn-soft border-warn/40 text-warn", bad: "bg-bad-soft border-bad/45 text-bad",
  locked: "bg-lock-soft border-lock/40 text-lock", info: "bg-brand-soft border-brand/40 text-[#c9c2ff]",
};

export function StatusChip({ status, children, size = "md", className }: { status: Status; children: ReactNode; size?: "sm" | "md"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-semibold", size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs", bg[status], className)}>
      <span aria-hidden className="leading-none">{STATUS_GLYPH[status]}</span>
      <span>{children}</span>
    </span>
  );
}

export function Badge({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "brand" | "mono"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium", tone === "neutral" && "bg-white/8 text-muted", tone === "brand" && "bg-brand-soft text-[#c9c2ff]", tone === "mono" && "bg-white/6 text-muted font-mono", className)}>
      {children}
    </span>
  );
}
