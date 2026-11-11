// Guided demo tour overlay (§14.3): spotlight on `data-tour` targets, caption card, Next/Back, "Tự chạy", progress dots, Esc to exit.
// Start: ?tour=1 (or ?tour=auto) · startTour() · window event "guardian:start-tour" · the TopBar button.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Loader2, Pause, Play, Sparkles, X, Zap } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useUiStore } from "../store/uiStore";
import { cn } from "../components/ui/cn";
import { sleep } from "./actions";
import { SCENES, TOUR_STEPS, type TourStep } from "./steps";
import { START_TOUR_EVENT, startTour, useTourStore } from "./tourStore";
import { useTargetRect, type Rect } from "./useTargetRect";
import { runDevState } from "./devHooks";

const CARD_W = 420;
const PAD = 10;

function placeCard(rect: Rect | null, placement: TourStep["placement"], vw: number, vh: number, cardH: number): { left: number; top: number; mode: "center" | "anchored" } {
  const margin = 16;
  const center = { left: (vw - CARD_W) / 2, top: Math.max(90, (vh - cardH) / 2), mode: "center" as const };
  if (!rect || placement === "center") return center;
  const tall = rect.height > vh * 0.6;
  const clampX = (x: number) => Math.min(Math.max(margin, x), vw - CARD_W - margin);
  const below = rect.top + rect.height + PAD + 14, above = rect.top - PAD - 14 - cardH;
  if (!tall && placement !== "top" && below + cardH < vh - 48) return { left: clampX(rect.left), top: below, mode: "anchored" };
  if (!tall && above > 100) return { left: clampX(rect.left), top: above, mode: "anchored" };
  const rightX = rect.left + rect.width + PAD + 16, leftX = rect.left - PAD - 16 - CARD_W;
  if (rightX + CARD_W < vw - margin) return { left: rightX, top: Math.min(Math.max(100, rect.top), vh - cardH - 56), mode: "anchored" };
  if (leftX > margin) return { left: leftX, top: Math.min(Math.max(100, rect.top), vh - cardH - 56), mode: "anchored" };
  return { left: clampX(vw - CARD_W - 24), top: vh - cardH - 56, mode: "anchored" };
}

function Dots({ index, onGoto }: { index: number; onGoto: (i: number) => void }) {
  const groups: { scene: number; items: number[] }[] = [];
  TOUR_STEPS.forEach((s, i) => { const g = groups[groups.length - 1]; if (g && g.scene === s.scene && s.scene !== 0) g.items.push(i); else groups.push({ scene: s.scene, items: [i] }); });
  return (
    <div className="flex items-center gap-2.5" role="tablist" aria-label="Tiến trình tour">
      {groups.map((g, gi) => (
        <div key={gi} className="flex items-center gap-1">
          {g.items.map((i) => (
            <button key={i} type="button" role="tab" aria-selected={i === index} aria-label={`Bước ${i + 1}: ${TOUR_STEPS[i].title}`} onClick={() => onGoto(i)}
              className={cn("h-1.5 rounded-full transition-all duration-300", i === index ? "w-5 bg-brand" : i < index ? "w-1.5 bg-brand/60 hover:bg-brand" : "w-1.5 bg-white/20 hover:bg-white/40")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function TourOverlay() {
  const { active, index, auto, start, stop, next, prev, goto, setAuto } = useTourStore();
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const demoMode = useUiStore((s) => s.demoMode);
  const step = TOUR_STEPS[index];
  const [running, setRunning] = useState(false);
  const [dwell, setDwell] = useState<{ ms: number; key: number } | null>(null);
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(250);
  const seq = useRef(0);
  const goRef = useRef(nav); goRef.current = nav;

  // entry points: ?tour=1|auto, ⌘K / TopBar custom event, dev state hook
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const t = sp.get("tour");
    if (t) { sp.delete("tour"); const q = sp.toString(); nav(loc.pathname + (q ? `?${q}` : ""), { replace: true }); start({ auto: t === "auto", index: Number(sp.get("tourstep")) || 0 }); }
    if (import.meta.env.DEV) void runDevState(nav, sp);
    const on = () => startTour();
    window.addEventListener(START_TOUR_EVENT, on);
    return () => window.removeEventListener(START_TOUR_EVENT, on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // reset the scenario once when a tour starts at the intro
  const wasActive = useRef(false);
  useEffect(() => {
    if (active && !wasActive.current && index === 0 && demoMode) { void api.resetDemo().then(() => qc.invalidateQueries()).catch(() => {}); useUiStore.getState().setSelectedPrincipals(["minh"]); }
    wasActive.current = active;
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const f = () => setVp({ w: window.innerWidth, h: window.innerHeight }); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  useEffect(() => { if (cardRef.current) setCardH(cardRef.current.offsetHeight); });

  const doRun = useCallback(async (s: TourStep) => {
    if (!s.run) return;
    setRunning(true);
    try { await s.run.fn({ nav: (to) => goRef.current(to) }); } catch { /* errors already surface as toasts via api layer */ }
    setRunning(false);
  }, []);

  // step engine: navigate -> (auto) run -> dwell -> next
  useEffect(() => {
    if (!active) return;
    const my = ++seq.current;
    const alive = () => seq.current === my;
    setDwell(null);
    (async () => {
      let to: string | undefined;
      try { to = typeof step.route === "function" ? await step.route() : step.route; } catch { to = undefined; }
      if (!alive()) return;
      if (to && to !== loc.pathname + loc.search && !(to === loc.pathname)) nav(to);
      if (!auto) return;
      await sleep(900); if (!alive()) return;
      if (step.run) { await doRun(step); if (!alive()) return; }
      const ms = step.dwell ?? 6000;
      setDwell({ ms, key: my });
      await sleep(ms); if (!alive()) return;
      if (index >= TOUR_STEPS.length - 1) { stop(); return; }
      next();
    })();
    return () => { seq.current++; };
  }, [active, index, auto]); // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (useUiStore.getState().paletteOpen) return;
      if (e.key === "Escape") { e.preventDefault(); stop(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, stop, next, prev]);

  const rect = useTargetRect(step.target, active && step.placement !== "center", step.id + loc.pathname + loc.search);
  const missing = active && !!step.target?.length && !rect;
  const pos = placeCard(rect, step.placement, vp.w, vp.h, cardH);
  const scene = SCENES[step.scene];
  const isFirst = index === 0, isLast = index === TOUR_STEPS.length - 1;

  if (!active) return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[90]" role="dialog" aria-label="Tour demo" data-tour-overlay>
      {/* dim + spotlight */}
      {rect ? (
        <motion.div aria-hidden className="absolute rounded-[18px]" initial={false}
          animate={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
          transition={{ type: "spring", stiffness: 260, damping: 32 }}
          style={{ boxShadow: "0 0 0 100vmax rgb(4 6 20 / 0.74), 0 0 0 2px rgb(139 124 246 / 0.95), 0 0 34px 4px rgb(139 124 246 / 0.55)" }}>
          <span className="absolute inset-[-6px] animate-ping rounded-[22px] border border-brand/60 [animation-duration:2.4s]" />
        </motion.div>
      ) : <div aria-hidden className="absolute inset-0 bg-[#040614]/60" />}

      {/* caption card */}
      <motion.div ref={cardRef} key={step.id} initial={{ opacity: 0, y: 14, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1, left: pos.left, top: pos.top }}
        transition={{ opacity: { duration: 0.25 }, y: { duration: 0.3 }, left: { type: "spring", stiffness: 240, damping: 30 }, top: { type: "spring", stiffness: 240, damping: 30 } }}
        style={{ width: CARD_W, left: pos.left, top: pos.top }}
        className={cn("pointer-events-auto absolute overflow-hidden rounded-[var(--radius-xl)] border border-brand/45 bg-[#0c1133]/95 shadow-[var(--shadow-pop)] backdrop-blur-xl", pos.mode === "center" && "text-center")}>
        <div className="absolute inset-x-0 top-0 h-px bg-[image:var(--brand-gradient)]" />
        {dwell && auto ? <motion.div key={dwell.key} className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-brand" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: dwell.ms / 1000, ease: "linear" }} /> : null}
        <div className="p-5">
          <div className={cn("mb-2.5 flex items-center gap-2", pos.mode === "center" ? "justify-center" : "justify-between")}>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#cfc9ff]">
              <Sparkles className="size-3" aria-hidden /> {scene.label}{step.scene > 0 && step.scene < 6 ? <span className="font-medium normal-case tracking-normal opacity-80">· {scene.name}</span> : null}
            </span>
            {pos.mode !== "center" ? <span className="tnum mr-8 text-[11px] text-faint">{index + 1}/{TOUR_STEPS.length}</span> : null}
          </div>
          <h2 className={cn("font-bold leading-tight tracking-tight text-text", pos.mode === "center" ? "text-[26px]" : "text-[18px]")}>{pos.mode === "center" && isFirst ? <span className="text-gradient">{step.title}</span> : step.title}</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-muted">{step.caption}</p>
          {missing ? <p className="mt-2 text-[11.5px] text-faint">(Phần tử này chưa hiện trên màn hình; tour vẫn tiếp tục được.)</p> : null}

          {step.run && !auto ? (
            <button type="button" onClick={() => doRun(step)} disabled={running}
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-ok/45 bg-ok-soft px-3 py-1.5 text-[13px] font-semibold text-ok transition-colors hover:bg-ok/20 disabled:opacity-60">
              {running ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Zap className="size-3.5" aria-hidden />} {step.run.label}
            </button>
          ) : null}
          {auto && step.run ? <p className="mt-3 inline-flex items-center gap-2 text-[12.5px] font-semibold text-ok">{running ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Zap className="size-3.5" aria-hidden />} Đang chạy: {step.run.label}</p> : null}

          <div className={cn("mt-4 flex items-center gap-2", pos.mode === "center" ? "justify-center" : "")}>
            {!isFirst ? <button type="button" onClick={prev} className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-[13px] font-semibold text-muted transition-colors hover:bg-white/8 hover:text-text"><ChevronLeft className="size-4" aria-hidden /> Quay lại</button> : null}
            <button type="button" onClick={() => setAuto(!auto)} aria-pressed={auto}
              className={cn("inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors", auto ? "border-warn/50 bg-warn-soft text-warn" : "border-line-strong text-muted hover:border-brand/60 hover:text-text")}>
              {auto ? <><Pause className="size-3.5" aria-hidden /> Tạm dừng</> : <><Play className="size-3.5" aria-hidden /> Tự chạy</>}
            </button>
            <button type="button" onClick={() => { if (isLast) stop(); else next(); }} data-autofocus
              className="ml-auto inline-flex h-9 items-center gap-1 rounded-lg bg-[image:var(--brand-gradient)] px-4 text-[13px] font-bold text-white shadow-[var(--shadow-glow-brand)] transition-all hover:brightness-110 active:scale-95">
              {isFirst ? "Bắt đầu" : isLast ? "Kết thúc" : "Tiếp"} <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <div className={cn("mt-4 flex items-center gap-3 border-t border-line pt-3", pos.mode === "center" ? "justify-center" : "justify-between")}>
            <Dots index={index} onGoto={goto} />
            {pos.mode !== "center" ? <span className="hidden text-[10.5px] text-faint sm:inline">← → · Esc thoát</span> : null}
          </div>
        </div>
        <button type="button" onClick={stop} aria-label="Thoát tour (Esc)" className="absolute right-3 top-3 grid size-7 place-items-center rounded-md text-faint transition-colors hover:bg-white/10 hover:text-text"><X className="size-4" aria-hidden /></button>
      </motion.div>
      <AnimatePresence />
    </div>,
    document.body,
  );
}
