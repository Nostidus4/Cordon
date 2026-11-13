import { Play, RotateCcw, Search } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { BRAND } from "../../config/brand";
import { CordonLogo } from "../brand/Logo";
import { useHealth } from "../../hooks/useHealth";
import { useDemoReset } from "../../hooks/useDemoReset";
import { useUiStore } from "../../store/uiStore";
import { Button, Kbd, StatusDot, Tooltip, cn } from "../ui";
import { fmtDisplay, toBase } from "../../lib/format";
import { policyLabel } from "../../lib/policy";

function LiveReplayToggle() {
  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);
  return (
    <div role="radiogroup" aria-label="Chế độ dữ liệu" className="relative inline-flex rounded-full border border-line bg-white/4 p-0.5">
      {(["live", "replay"] as const).map((m) => (
        <button key={m} role="radio" aria-checked={mode === m} type="button" onClick={() => setMode(m)}
          className={cn("relative z-10 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-semibold transition-colors", mode === m ? "text-text" : "text-faint hover:text-muted")}>
          {mode === m ? <motion.span layoutId="mode-pill" className={cn("absolute inset-0 -z-10 rounded-full ring-1", m === "live" ? "bg-ok-soft ring-ok/40" : "bg-brand-soft ring-brand/50")} transition={{ type: "spring", stiffness: 500, damping: 36 }} /> : null}
          {m === "live" ? <span aria-hidden className={cn("size-1.5 rounded-full", mode === "live" ? "bg-ok animate-pulse" : "bg-faint")} /> : <span aria-hidden>↺</span>}
          {m === "live" ? "Live" : "Replay"}
        </button>
      ))}
    </div>
  );
}

export function TopBar() {
  const { data: h, isError } = useHealth();
  const demoMode = useUiStore((s) => s.demoMode);
  const setPalette = useUiStore((s) => s.setPaletteOpen);
  const reset = useDemoReset();
  const status: "ok" | "bad" | "warn" = isError ? "bad" : h && h.status !== "ok" ? "warn" : "ok";
  const block = h ? fmtDisplay(toBase(h.l1Block)) : "…";
  return (
    <div className="flex h-14 items-center gap-4 px-6">
      <div className="flex items-center gap-3">
        <CordonLogo tone="light" height={30} title={BRAND.name} />
        <p className="border-l border-line pl-3 text-[11px] leading-tight text-faint">{BRAND.company}</p>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <Tooltip content={h ? (h.chainMode === "sim" ? "Chain giả lập: tx hash gắn nhãn mô phỏng" : "Guardian L1 trên Fuji") : "Đang kết nối"}>
          <div tabIndex={0} className="flex items-center gap-2 rounded-full border border-line bg-white/4 px-3 py-1.5 text-xs text-muted">
            <StatusDot status={status} pulse={status === "ok"} />
            <span className="font-medium text-text">{isError ? "Mất kết nối chain" : "Guardian L1"}</span>
            {!isError ? <span className="tnum text-faint">block <AnimatePresence mode="popLayout"><motion.b key={block} initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} className="inline-block font-semibold text-text">#{block}</motion.b></AnimatePresence></span> : null}
            {h?.chainMode === "sim" ? <span className="rounded bg-sim/15 px-1.5 text-[10px] font-semibold text-sim">sim</span> : null}
          </div>
        </Tooltip>
        <Tooltip content="Phiên bản chính sách hiện hành">
          <span tabIndex={0} className="rounded-full border border-brand/40 bg-brand-soft px-3 py-1.5 text-xs font-bold text-[#cfc9ff]">
            <AnimatePresence mode="popLayout"><motion.span key={policyLabel(h)} className="inline-block tnum" initial={{ scale: 1.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>policy v{policyLabel(h) ?? "…"}</motion.span></AnimatePresence>
          </span>
        </Tooltip>
        <LiveReplayToggle />
        {demoMode ? <Button size="sm" variant="secondary" icon={<RotateCcw className="size-3.5" />} loading={reset.isPending} onClick={() => reset.mutate()}>Đặt lại kịch bản</Button> : null}
        <Button size="sm" variant="secondary" icon={<Play className="size-3.5" />} onClick={() => window.dispatchEvent(new Event("guardian:start-tour"))}>Tour demo</Button>
        <button type="button" onClick={() => setPalette(true)} className="inline-flex items-center gap-2 rounded-full border border-line bg-white/4 py-1.5 pl-3 pr-2 text-xs text-muted transition-colors hover:border-line-strong hover:text-text" aria-label="Mở bảng lệnh (⌘K)">
          <Search className="size-3.5" aria-hidden /> Tìm lệnh <Kbd>⌘K</Kbd>
        </button>
      </div>
    </div>
  );
}
