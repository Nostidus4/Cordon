// Execution stamp/seal animation shown when a proposal reaches 2/3 and is executed (spec C1: Executed, policy v2).
import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { cn } from "../../components/ui";

/** Big overlay stamp that thumps once then settles; `show` toggles on the open->executed transition. */
export function ExecutionBurst({ show, version }: { show: boolean; version: number | null }) {
  return (
    <AnimatePresence>
      {show ? (
        <motion.div key="burst" className="pointer-events-none absolute inset-0 z-20 grid place-items-center overflow-hidden rounded-[var(--radius-lg)]" initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.6 } }}>
          <motion.div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgb(52_224_180/0.28),transparent_62%)]" initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0.5] }} transition={{ duration: 1.4 }} />
          {[0, 1, 2].map((i) => (
            <motion.span key={i} className="absolute size-40 rounded-full border-2 border-ok/60" initial={{ scale: 0.4, opacity: 0.9 }} animate={{ scale: 4.2, opacity: 0 }} transition={{ delay: 0.25 + i * 0.22, duration: 1.4, ease: "easeOut" }} />
          ))}
          <motion.div initial={{ scale: 3, opacity: 0, rotate: -22 }} animate={{ scale: 1, opacity: 1, rotate: -8 }} transition={{ type: "spring", stiffness: 340, damping: 16, delay: 0.15 }}
            className="flex flex-col items-center rounded-2xl border-[3px] border-ok bg-[#04261d]/85 px-9 py-5 text-ok shadow-[0_0_60px_-6px_var(--color-ok)] backdrop-blur-sm">
            <ShieldCheck className="mb-1 size-10" strokeWidth={2.2} aria-hidden />
            <span className="text-3xl font-black tracking-[0.18em]">ĐÃ THỰC THI</span>
            <span className="mt-1 text-sm font-semibold tracking-widest opacity-90">policy v{version ?? "?"} · 2/3 Hội đồng</span>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/** Permanent banner for executed proposals with the Map link. */
export function ExecutedBanner({ version, at, className }: { version: number | null; at: string | null; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn("flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-ok/45 bg-ok-soft px-4 py-3", className)} data-tour="req-executed">
      <span className="grid size-9 place-items-center rounded-full bg-ok/20 text-ok"><ShieldCheck className="size-5" aria-hidden /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ok">Đã thực thi · policy v{version ?? "?"}</p>
        <p className="text-xs text-[#a9f0dc]">Hội đồng duyệt đủ 2/3{at ? `, ${new Date(at).toLocaleTimeString("vi-VN")}` : ""}. Bản đồ đã được vẽ lại theo chính sách mới.</p>
      </div>
      <Link to="/map" className="inline-flex items-center gap-1.5 rounded-full bg-ok px-4 py-2 text-sm font-bold text-[#04261d] shadow-[var(--shadow-glow-ok)] transition-all hover:brightness-110">
        Xem trên Map <ArrowUpRight className="size-4" aria-hidden />
      </Link>
    </motion.div>
  );
}
