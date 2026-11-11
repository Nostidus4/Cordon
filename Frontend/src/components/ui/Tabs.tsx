import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "./cn";

export interface TabItem { id: string; label: ReactNode; icon?: ReactNode; content?: ReactNode }

/** Controlled (value/onChange) or uncontrolled (defaultValue). Animated pill; arrow-key navigation. */
export function Tabs({ items, value, defaultValue, onChange, className, panelClassName }: {
  items: TabItem[]; value?: string; defaultValue?: string; onChange?: (id: string) => void; className?: string; panelClassName?: string;
}) {
  const uid = useId();
  const [inner, setInner] = useState(defaultValue ?? items[0]?.id);
  const cur = value ?? inner;
  const set = (id: string) => { setInner(id); onChange?.(id); };
  const onKey = (e: KeyboardEvent) => {
    const i = items.findIndex((x) => x.id === cur);
    if (e.key === "ArrowRight") set(items[(i + 1) % items.length].id);
    else if (e.key === "ArrowLeft") set(items[(i - 1 + items.length) % items.length].id);
    else return;
    e.preventDefault();
  };
  return (
    <div className={className}>
      <div role="tablist" onKeyDown={onKey} className="inline-flex gap-1 rounded-[var(--radius-md)] border border-line bg-white/4 p-1">
        {items.map((t) => (
          <button key={t.id} role="tab" type="button" id={`${uid}-t-${t.id}`} aria-selected={cur === t.id} aria-controls={`${uid}-p-${t.id}`} tabIndex={cur === t.id ? 0 : -1}
            onClick={() => set(t.id)}
            className={cn("relative inline-flex items-center gap-2 rounded-[var(--radius-sm)] px-3.5 py-1.5 text-sm font-medium transition-colors", cur === t.id ? "text-text" : "text-muted hover:text-text")}>
            {cur === t.id ? <motion.span layoutId={`${uid}-pill`} className="absolute inset-0 rounded-[var(--radius-sm)] bg-brand-soft ring-1 ring-brand/50" transition={{ type: "spring", stiffness: 500, damping: 36 }} /> : null}
            <span className="relative flex items-center gap-2">{t.icon}{t.label}</span>
          </button>
        ))}
      </div>
      {items.map((t) => t.content !== undefined && cur === t.id ? (
        <div key={t.id} role="tabpanel" id={`${uid}-p-${t.id}`} aria-labelledby={`${uid}-t-${t.id}`} className={cn("mt-4", panelClassName)}>{t.content}</div>
      ) : null)}
    </div>
  );
}
