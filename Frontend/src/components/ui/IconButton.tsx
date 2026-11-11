import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "./cn";
import { Tooltip } from "./Tooltip";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** required: accessible name (also shown as tooltip) */
  label: string;
  icon: ReactNode;
  size?: "sm" | "md" | "lg";
  active?: boolean;
}
const sz = { sm: "size-8", md: "size-10", lg: "size-12" } as const;

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, size = "md", active, className, ...rest }, ref,
) {
  return (
    <Tooltip content={label}>
      <button ref={ref} type="button" aria-label={label} aria-pressed={active}
        className={cn("inline-flex items-center justify-center rounded-[var(--radius-md)] text-muted transition-all duration-[var(--dur-base)] hover:text-text hover:bg-white/8 active:scale-95 disabled:opacity-40", sz[size], active && "bg-brand-soft text-text", className)}
        {...rest}>
        {icon}
      </button>
    </Tooltip>
  );
});
