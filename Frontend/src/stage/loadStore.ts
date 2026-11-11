// Loading state of the 3D city, shared by the loader overlay (StageLoader) and the runtime that reports real progress (CityRuntime).
// phase: "loading" = poster + progress card; "revealed" = live canvas faded in (the city assembles itself, card shrinks to a corner);
// "lite" = no 3D (no WebGL / slow device / context lost / skipped). `assembled` = the build-up animation finished: overlay cards pop in.
import { create } from "zustand";

export type LoadPhase = "loading" | "revealed" | "lite";
export type LiteReason = "no-webgl" | "slow-device" | "context-lost" | "skipped" | "error";

interface LoadStore {
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

export const useLoadStore = create<LoadStore>((set) => ({
  phase: "loading",
  assembled: false,
  liteReason: null,
  pct: 4,
  loaded: 0,
  total: 0,
  setProgress: (pct, loaded, total) => set((s) => ({ pct: Math.max(s.pct, Math.min(100, Math.round(pct))), loaded: loaded ?? s.loaded, total: total ?? s.total })),
  setRevealed: () => set((s) => (s.phase === "loading" ? { phase: "revealed", pct: 100 } : s)),
  setAssembled: () => set((s) => (s.assembled ? s : { assembled: true })),
  setLite: (liteReason) => set({ phase: "lite", liteReason, assembled: true }),
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
