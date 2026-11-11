import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-line-strong px-6 py-12 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-brand-soft text-brand">{icon ?? <Inbox className="size-6" aria-hidden />}</div>
      <p className="text-base font-semibold text-text">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted">{description}</p> : null}
      {action}
    </div>
  );
}
