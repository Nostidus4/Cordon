// Subtle pulsing ring around the next recommended control (guides the presenter). Static under prefers-reduced-motion.
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "../../components/ui";

export function NextPulse({ on, children, tone = "brand", className, radius = "rounded-[var(--radius-md)]" }: { on: boolean; children: ReactNode; tone?: "brand" | "bad"; className?: string; radius?: string }) {
  const reduce = useReducedMotion();
  const c = tone === "bad" ? "255 107 122" : "139 124 246";
  return (
    <span className={cn("relative inline-flex", className)} data-next={on || undefined}>
      {on ? (
        <motion.span aria-hidden className={cn("pointer-events-none absolute -inset-1", radius)} style={{ boxShadow: `0 0 0 2px rgb(${c} / 0.85)` }}
          animate={reduce ? { opacity: 1 } : { opacity: [0.9, 0.25, 0.9], scale: [1, 1.05, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />
      ) : null}
      {children}
    </span>
  );
}
