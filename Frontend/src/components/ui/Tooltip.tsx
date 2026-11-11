import { cloneElement, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

/** Hover/focus tooltip rendered in a portal (never clipped by overflow). Child must accept ref-less props (wrap in <span> if needed). */
export function Tooltip({ content, children, side = "top", delay = 150 }: {
  content: ReactNode; children: ReactElement<Record<string, unknown>>; side?: "top" | "bottom"; delay?: number;
}) {
  const id = useId();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const show = () => {
    clearTimeout(t.current);
    t.current = setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setPos({ x: r.left + r.width / 2, y: side === "top" ? r.top - 8 : r.bottom + 8 });
    }, delay);
  };
  const hide = () => { clearTimeout(t.current); setPos(null); };
  return (
    <>
      <span ref={ref} className="inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocusCapture={show} onBlurCapture={hide}>
        {cloneElement(children, { "aria-describedby": pos ? id : undefined })}
      </span>
      {createPortal(
        <AnimatePresence>
          {pos ? (
            <motion.div id={id} role="tooltip" initial={{ opacity: 0, y: side === "top" ? 4 : -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}
              style={{ position: "fixed", left: pos.x, top: pos.y, transform: `translate(-50%, ${side === "top" ? "-100%" : "0"})`, zIndex: 100 }}
              className="pointer-events-none rounded-lg border border-line-strong bg-[#0d1236] px-2.5 py-1.5 text-xs text-text shadow-[var(--shadow-pop)]">
              {content}
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
