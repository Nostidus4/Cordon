import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  /** reason shown to AT users when disabled (e.g. conflict of interest) */
  disabledReason?: string;
}

const base = "relative inline-flex items-center justify-center gap-2 font-semibold select-none whitespace-nowrap transition-all duration-[var(--dur-base)] ease-[var(--ease-out)] active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none disabled:saturate-50";
const variants: Record<ButtonVariant, string> = {
  primary: "text-white bg-[image:var(--brand-gradient)] shadow-[var(--shadow-glow-brand)] hover:brightness-110 hover:-translate-y-px",
  secondary: "text-text bg-surface-2/80 border border-line-strong hover:bg-surface-2 hover:border-brand/60",
  ghost: "text-muted hover:text-text hover:bg-white/5",
  danger: "text-white bg-bad-strong shadow-[var(--shadow-glow-bad)] hover:brightness-110 hover:-translate-y-px",
  success: "text-[#04261d] bg-ok shadow-[var(--shadow-glow-ok)] hover:brightness-110",
};
const sizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] rounded-[var(--radius-sm)]",
  md: "h-10 px-4 text-sm rounded-[var(--radius-md)]",
  lg: "h-12 px-6 text-[15px] rounded-[var(--radius-md)]",
  /** big red kill-switch button ("Khoá khu anh Minh") */
  xl: "h-16 px-8 text-lg tracking-wide rounded-[var(--radius-lg)]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading, icon, disabledReason, className, children, disabled, title, ...rest }, ref,
) {
  return (
    <button
      ref={ref} type="button" disabled={disabled || loading} aria-busy={loading || undefined}
      title={disabled && disabledReason ? disabledReason : title}
      className={cn(base, variants[variant], sizes[size], variant === "danger" && size === "xl" && "alarm-hover", className)}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
      {disabled && disabledReason ? <span className="sr-only"> ({disabledReason})</span> : null}
    </button>
  );
});
