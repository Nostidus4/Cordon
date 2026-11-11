// Loading state of the 3D city, shared by the loader overlay (StageLoader) and the runtime that reports real progress (CityRuntime).
// phase: "loading" = poster + progress card; "revealed" = live canvas faded in (the city assembles itself, card shrinks to a corner);
// "lite" = no 3D (no WebGL / slow device / context lost / skipped). `assembled` = the build-up animation finished: overlay cards pop in.
import { create } from "zustand";
import { armAssembly, setAssemblyGate } from "../city3d/assembly";

export type LoadPhase = "loading" | "revealed" | "lite";
export type LiteReason = "no-webgl" | "slow-device" | "context-lost" | "skipped" | "error";

/** "wait" = the loader shows "Bước vào thành phố ▶" and the city assembles only after the tap (so its sound can play); "open" = tapped / skipped. */
export type Gate = "wait" | "open";
/** Gate is skipped for: reduced motion, ?autoplay=… / ?gate=0 dev hooks, lite mode. It is NOT remembered across reloads:
 *  browsers block audio until a gesture on every page load, so each load asks again (in-app navigation keeps this module's state). */
export function initialGate(): Gate {
  try {
    const q = new URLSearchParams(location.search);
    if (q.has("autoplay") || q.get("gate") === "0" || q.get("lite") === "1") return "open";
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return "open";
  } catch { /* no DOM */ }
  return "wait";
}

interface LoadStore {
  gate: Gate;
  phase: LoadPhase;
  assembled: boolean;
  liteReason: LiteReason | null;
  /** 0..100, monotonic */
  pct: number;
  loaded: number;
  total: number;
  setProgress: (pct: number, loaded?: number, total?: number) => void;
  setRevealed: () => void;
  setAssembled: () => void;
  setLite: (reason: LiteReason) => void;
}

/** The visitor entered the city (tap, Space/Enter) or the gate timed out: let the assembly run. */
export function enterCity() {
  useLoadStore.setState({ gate: "open" });
  armAssembly();
}

const startGate = initialGate();
setAssemblyGate(startGate === "wait");

export const useLoadStore = create<LoadStore>((set) => ({
  gate: startGate,
  phase: "loading",
  assembled: false,
  liteReason: null,
  pct: 4,
  loaded: 0,
  total: 0,
  setProgress: (pct, loaded, total) => set((s) => ({ pct: Math.max(s.pct, Math.min(100, Math.round(pct))), loaded: loaded ?? s.loaded, total: total ?? s.total })),
  setRevealed: () => set((s) => (s.phase === "loading" ? { phase: "revealed", pct: 100 } : s)),
  setAssembled: () => set((s) => (s.assembled ? s : { assembled: true })),
  setLite: (liteReason) => set({ phase: "lite", liteReason, assembled: true, gate: "open" }),
}));

/** Cheap capability probe: can this browser create a WebGL context, and is the device clearly too weak for the 3D city? */
export function probeLite(): LiteReason | null {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get("lite") === "1") return "skipped";
    if (q.get("lite") === "0") return null;
    if (typeof navigator !== "undefined" && navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return "slow-device";
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    if (!gl) return "no-webgl";
    (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  } catch {
    return "no-webgl";
  }
}
