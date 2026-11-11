import { cn } from "./cn";
/** Chain/agent status dot. Always paired with text by callers (not color-only). */
export function StatusDot({ status, pulse }: { status: "ok" | "warn" | "bad" | "idle"; pulse?: boolean }) {
  const c = { ok: "bg-ok text-ok", warn: "bg-warn text-warn", bad: "bg-bad text-bad", idle: "bg-lock text-lock" }[status];
  return <span aria-hidden className={cn("inline-block size-2.5 rounded-full", c, pulse && "animate-pulse-ring")} />;
}
