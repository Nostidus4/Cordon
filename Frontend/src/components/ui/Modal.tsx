import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "./cn";
import { IconButton } from "./IconButton";

interface BaseProps { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children?: ReactNode; footer?: ReactNode; className?: string }

function useOverlay(open: boolean, onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key === "Tab" && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
        else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
      }
    };
    document.addEventListener("keydown", onKey);
    setTimeout(() => panel.current?.querySelector<HTMLElement>("[data-autofocus],button,input")?.focus(), 30);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [open, onClose]);
  return panel;
}

function Header({ title, description, onClose }: Pick<BaseProps, "title" | "description" | "onClose">) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
      <div><h2 className="text-lg font-semibold text-text">{title}</h2>{description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}</div>
      <IconButton label="Đóng" size="sm" icon={<X className="size-4" />} onClick={onClose} />
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, className }: BaseProps) {
  const panel = useOverlay(open, onClose);
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[80] grid place-items-center p-6">
          <motion.div className="absolute inset-0 bg-[#02030c]/70 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div ref={panel} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
            initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.98 }} transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className={cn("glass relative w-full max-w-lg rounded-[var(--radius-xl)] bg-glass-strong shadow-[var(--shadow-pop)]", className)}>
            <Header title={title} description={description} onClose={onClose} />
            <div className="px-6 py-5 text-sm text-muted">{children}</div>
            {footer ? <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, description, children, footer, className, side = "right" }: BaseProps & { side?: "right" | "left" }) {
  const panel = useOverlay(open, onClose);
  const x = side === "right" ? 40 : -40;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[80]">
          <motion.div className="absolute inset-0 bg-[#02030c]/60 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.aside ref={panel} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}
            initial={{ opacity: 0, x }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x }} transition={{ type: "spring", stiffness: 340, damping: 34 }}
            className={cn("glass absolute top-0 flex h-full w-[min(30rem,92vw)] flex-col bg-glass-strong shadow-[var(--shadow-pop)]", side === "right" ? "right-0 rounded-l-[var(--radius-xl)]" : "left-0 rounded-r-[var(--radius-xl)]", className)}>
            <Header title={title} description={description} onClose={onClose} />
            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 text-sm text-muted">{children}</div>
            {footer ? <div className="flex justify-end gap-2 border-t border-line px-6 py-4">{footer}</div> : null}
          </motion.aside>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
