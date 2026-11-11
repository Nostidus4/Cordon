import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: "default" | "ok" | "warn" | "bad" | "lock" | "brand";
  padded?: boolean;
  strong?: boolean;
  /** raise on hover (clickable cards) */
  interactive?: boolean;
}
const ring: Record<NonNullable<CardProps["tone"]>, string> = {
  default: "", brand: "border-brand/50", ok: "border-ok/40", warn: "border-warn/50", bad: "border-bad/55", lock: "border-lock/40",
};
/** Glass surface. `GlassPanel` is an alias. */
export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { tone = "default", padded = true, strong, interactive, className, ...rest }, ref,
) {
  return (
    <div ref={ref} className={cn("glass rounded-[var(--radius-lg)]", padded && "p-5", strong && "bg-glass-strong", interactive && "transition-all duration-[var(--dur-base)] hover:-translate-y-0.5 hover:border-line-strong cursor-pointer", ring[tone], className)} {...rest} />
  );
});
export const GlassPanel = Card;

export function CardHeader({ title, en, right, className }: { title: ReactNode; en?: string; right?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div>
        <h3 className="text-[15px] font-semibold text-text leading-tight">{title}</h3>
        {en ? <p className="mt-0.5 text-xs text-faint">{en}</p> : null}
      </div>
      {right}
    </div>
  );
}
