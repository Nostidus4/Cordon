import type { ReactNode } from "react";
/** Screen title with the small English label beside it (spec §10.1). */
export function PageHeader({ title, en, description, actions }: { title: string; en: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex items-end justify-between gap-6">
      <div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-text">{title}</h1>
          <span className="rounded-md border border-line px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-faint">{en}</span>
        </div>
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}
