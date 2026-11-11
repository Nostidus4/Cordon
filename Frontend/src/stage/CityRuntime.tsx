// The heavy half of the stage: three.js + r3f + drei + the real city. Lazy-loaded by CityLayer so the loader paints without it.
// Reports real load progress (drei useProgress = every glb/draco/texture the city asks for) into loadStore and flips it to "revealed"
// the base island has arrived (or the assets settled), so the canvas is revealed while the city assembles itself on screen.
import { useEffect, useRef, type ComponentType } from "react";
import { useProgress } from "@react-three/drei";
import type { CityStageProps } from "./contract";
import { onAssembled } from "../city3d/assembly";
import { useLoadStore } from "./loadStore";

// import.meta.glob keeps the build green whether or not the file is there yet.
const found = import.meta.glob("../city3d/CityStage.tsx", { eager: true }) as Record<string, { default: ComponentType<CityStageProps> }>;
const RealCity = Object.values(found)[0]?.default ?? null;

const NO_MODELS_MS = 4000;     // no asset activity this long after mount = nothing to wait for (e.g. models absent)
const SETTLE_MS = 500;         // assets idle this long after the last one finished = done
const BASE_DECODE_MS = 300;    // base glb downloaded -> give the GPU upload / first frames a moment, then reveal
const HARD_TIMEOUT_MS = 20000;
const ASSEMBLE_FALLBACK_MS = 6000; // the build-up animation never reported back: show the cards anyway

const reveal = () => requestAnimationFrame(() => requestAnimationFrame(() => useLoadStore.getState().setRevealed()));

function ProgressProbe() {
  const { active, loaded, total, progress } = useProgress();
  const setProgress = useLoadStore((s) => s.setProgress);
  const sawWork = useRef(false);
  const t0 = useRef(performance.now());

  useEffect(() => {
    // runtime code has arrived (25%), models take the rest
    setProgress(total > 0 ? 25 + progress * 0.7 : 25, loaded, total);
    if (total > 0) sawWork.current = true;
  }, [progress, loaded, total, setProgress]);

  useEffect(() => {
    if (active) return;
    const wait = sawWork.current ? SETTLE_MS : Math.max(NO_MODELS_MS - (performance.now() - t0.current), 0);
    const id = window.setTimeout(reveal, wait);
    return () => window.clearTimeout(id);
  }, [active, total]);

  useEffect(() => {
    const id = window.setTimeout(() => useLoadStore.getState().setRevealed(), HARD_TIMEOUT_MS);
    return () => window.clearTimeout(id);
  }, []);

  // the base island is the first thing worth showing: reveal as soon as its glb has been fetched (Resource Timing works for preloads too)
  useEffect(() => {
    const check = (list: PerformanceEntryList) => { if (list.some((e) => e.name.includes("city_base.glb") && (e as PerformanceResourceTiming).responseEnd > 0)) window.setTimeout(reveal, BASE_DECODE_MS); };
    try {
      check(performance.getEntriesByType("resource"));
      const po = new PerformanceObserver((l) => check(l.getEntries()));
      po.observe({ type: "resource", buffered: true });
      return () => po.disconnect();
    } catch { return undefined; }
  }, []);
  return null;
}

/** After the reveal: `assembled` comes from the city (src/city3d build-up animation); if it never does, a timeout lets the cards in. */
function AssembleWatch() {
  const phase = useLoadStore((s) => s.phase);
  useEffect(() => onAssembled(() => { useLoadStore.getState().setRevealed(); useLoadStore.getState().setAssembled(); }), []);
  useEffect(() => {
    if (phase !== "revealed") return;
    const id = window.setTimeout(() => useLoadStore.getState().setAssembled(), ASSEMBLE_FALLBACK_MS);
    return () => window.clearTimeout(id);
  }, [phase]);
  return null;
}

export default function CityRuntime(props: CityStageProps) {
  useEffect(() => {
    // a lost WebGL context never bubbles; capture it from any canvas
    const onLost = (e: Event) => {
      if (!(e.target instanceof HTMLCanvasElement)) return;
      e.preventDefault();
      useLoadStore.getState().setLite("context-lost");
    };
    document.addEventListener("webglcontextlost", onLost, true);
    return () => document.removeEventListener("webglcontextlost", onLost, true);
  }, []);
  if (!RealCity) return null;
  return (
    <>
      <RealCity {...props} />
      <ProgressProbe />
      <AssembleWatch />
    </>
  );
}
