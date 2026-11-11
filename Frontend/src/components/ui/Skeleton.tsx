import { cn } from "./cn";
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton rounded-md", className ?? "h-4 w-full")} />;
}
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("glass rounded-[var(--radius-lg)] p-5", className)} role="status" aria-label="Đang tải">
      <Skeleton className="mb-4 h-5 w-1/3" />
      <div className="space-y-2.5">{Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")} />)}</div>
    </div>
  );
}
