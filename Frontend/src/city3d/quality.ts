import { create } from "zustand";

/** Render quality ladder. Steps down automatically (FrameGovernor) when the measured fps stays low. */
export type Tier = "high" | "low";
export interface Level {
  dpr: number;
  tier: Tier;
}
export const LEVELS: Level[] = [
  { dpr: 1.5, tier: "high" },
  { dpr: 1, tier: "high" },
  { dpr: 1, tier: "low" },
];

const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();

/** ?tier=high|mid|low pins the level (no auto step-down): used for profiling. */
function initial(): { level: number; pinned: boolean } {
  const t = q.get("tier");
  if (t === "high") return { level: 0, pinned: true };
  if (t === "mid") return { level: 1, pinned: true };
  if (t === "low") return { level: 2, pinned: true };
  if (typeof navigator === "undefined") return { level: 0, pinned: false };
  const nav = navigator as Navigator & { deviceMemory?: number };
  const weak = (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4;
  return { level: weak ? 1 : 0, pinned: false };
}

interface QualityState {
  level: number;
  pinned: boolean;
}

export const useQuality = create<QualityState>(() => initial());

export const deviceDpr = () => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
export const effectiveDpr = (level: number) => Math.min(deviceDpr(), LEVELS[level].dpr);
export const currentTier = (): Tier => LEVELS[useQuality.getState().level].tier;
export const prefersReducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
