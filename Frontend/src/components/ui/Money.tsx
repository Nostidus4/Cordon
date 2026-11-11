import type { Money as MoneyT } from "../../types";
import { fmtDisplay } from "../../lib/format";
import { cn } from "./cn";

type Props = {
  /** API Money, or base-unit bigint */
  value: MoneyT | bigint | null | undefined;
  /** append "/ngày" (use for caps) */
  perDay?: boolean;
  /** show currency suffix */
  unit?: string | false;
  size?: "sm" | "md" | "lg" | "xl" | "hero";
  tone?: "default" | "ok" | "warn" | "bad" | "lock" | "muted";
  className?: string;
};
const sz = { sm: "text-sm", md: "text-base", lg: "text-2xl", xl: "text-4xl", hero: "text-6xl" } as const;
const tn = { default: "text-text", ok: "text-ok", warn: "text-warn", bad: "text-bad", lock: "text-lock", muted: "text-muted" } as const;

/** Always `30.000` format (spec §10.1), tabular, with optional `/ngày`. */
export function Money({ value, perDay, unit = false, size = "md", tone = "default", className }: Props) {
  const display = value == null ? "—" : typeof value === "bigint" ? fmtDisplay(value) : value.display;
  return (
    <span className={cn("tnum inline-flex items-baseline gap-1 font-bold tracking-tight", sz[size], tn[tone], className)}>
      <span>{display}</span>
      {unit ? <span className="text-[0.5em] font-medium text-faint">{unit}</span> : null}
      {perDay ? <span className="text-[0.6em] font-medium text-faint">/ngày</span> : null}
    </span>
  );
}
