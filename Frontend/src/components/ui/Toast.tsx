import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useEffect } from "react";
import { useUiStore, type ToastItem, type ToastKind } from "../../store/uiStore";
import { cn } from "./cn";

const meta: Record<ToastKind, { icon: typeof Info; color: string; glyph: string }> = {
  success: { icon: CheckCircle2, color: "text-ok border-ok/40", glyph: "✓" },
  error: { icon: XCircle, color: "text-bad border-bad/50", glyph: "✕" },
  warning: { icon: AlertTriangle, color: "text-warn border-warn/45", glyph: "▲" },
  info: { icon: Info, color: "text-accent border-accent/40", glyph: "●" },
};
function ToastCard({ t }: { t: ToastItem }) {
  const dismiss = useUiStore((s) => s.dismissToast);
  useEffect(() => { const h = setTimeout(() => dismiss(t.id), t.duration); return () => clearTimeout(h); }, [t.id, t.duration, dismiss]);
  const m = meta[t.kind]; const Icon = m.icon;
  return (
    <motion.div layout initial={{ opacity: 0, x: 40, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}
      role={t.kind === "error" ? "alert" : "status"}
      className={cn("glass pointer-events-auto flex w-80 items-start gap-3 rounded-[var(--radius-md)] bg-glass-strong p-3.5 shadow-[var(--shadow-pop)]", m.color)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text"><span className="sr-only">{m.glyph} </span>{t.title}</p>
        {t.description ? <p className="mt-0.5 text-xs text-muted">{t.description}</p> : null}
        {t.action ? <button type="button" onClick={() => { t.action?.onClick(); dismiss(t.id); }} className="mt-2 rounded-full border border-current/40 px-2.5 py-0.5 text-xs font-semibold text-text transition-colors hover:bg-white/10">{t.action.label}</button> : null}
      </div>
      <button type="button" aria-label="Đóng thông báo" onClick={() => dismiss(t.id)} className="text-faint hover:text-text"><X className="size-4" /></button>
    </motion.div>
  );
}
/** Mount once (AppShell). Push with `toast.success(...)` from store/uiStore. */
export function ToastViewport() {
  const toasts = useUiStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed bottom-14 right-5 z-[90] flex flex-col gap-2" aria-live="polite">
      <AnimatePresence initial={false}>{toasts.map((t) => <ToastCard key={t.id} t={t} />)}</AnimatePresence>
    </div>
  );
}
