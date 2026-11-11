import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { fmtDisplay, toBase } from "../../lib/format";
import { cn } from "./cn";

const reduced = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Count-up in display units (30000 -> "30.000"). Re-animates from the previous value when `value` changes. */
export function AnimatedNumber({ value, duration = 1.1, format, className, from }: {
  value: number; duration?: number; format?: (n: number) => string; className?: string; from?: number;
}) {
  const fmt = format ?? ((n: number) => fmtDisplay(toBase(Math.round(n))));
  const [shown, setShown] = useState(from ?? value);
  const prev = useRef(from ?? value);
  useEffect(() => {
    if (reduced()) { setShown(value); prev.current = value; return; }
    const c = animate(prev.current, value, { duration, ease: [0.22, 1, 0.36, 1], onUpdate: (v) => setShown(v) });
    prev.current = value;
    return () => c.stop();
  }, [value, duration]);
  return <span className={cn("tnum", className)} aria-label={fmt(value)}>{fmt(shown)}</span>;
}
