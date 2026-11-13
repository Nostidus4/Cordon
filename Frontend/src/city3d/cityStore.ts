import { create } from "zustand";
import { BUILDINGS, type BuildingState } from "./buildings";
import { SCENARIOS, type ScenarioId } from "./scenarios";
import type { BuildingEvidence, CityStates } from "../types";

export type Reason = { reasonVi: string; evidence?: BuildingEvidence };

type States = Record<string, BuildingState>;

const allNormal = (): States => Object.fromEntries(BUILDINGS.map((b) => [b.code, "normal" as const]));

export interface ScenarioRun {
  id: ScenarioId | null;
  elapsed: number;
  paused: boolean;
  finished: boolean;
}
const IDLE: ScenarioRun = { id: null, elapsed: 0, paused: false, finished: false };

interface CityStore {
  states: States;
  chips: Record<string, string>; // card label overrides (e.g. "Đang sơ tán")
  selected: string | null;
  hovered: string | null;
  scenario: ScenarioRun;
  reasons: Record<string, Reason>;
  liveCache: CityStates | null;
  /** Apply a live snapshot (GET /city/states or stream city_updated). Always cached; shown only while source === "live". */
  applyLive: (c: CityStates) => void;
  goLive: () => void;
  cards: boolean; // building label cards visible
  setCards: (b: boolean) => void;
  shot: import("../stage/contract").CameraShot | null; // stage-driven camera shot
  setShot: (s: import("../stage/contract").CameraShot | null) => void;
  mode: "day" | "night";
  autoCycle: boolean;
  setMode: (m: "day" | "night") => void;
  setAutoCycle: (a: boolean) => void;
  source: "demo" | "live";
  setSource: (s: "demo" | "live") => void;
  /** Externally settable (e.g. live SSE adapter later): merge partial building states. */
  setStates: (partial: Record<string, BuildingState>, chips?: Record<string, string>) => void;
  select: (code: string | null) => void;
  hover: (code: string | null) => void;
  setState: (code: string, s: BuildingState) => void;
  resetAll: () => void;
  startScenario: (id: ScenarioId, at?: number, paused?: boolean) => void;
  togglePause: () => void;
  stopScenario: () => void;
}

let timer: ReturnType<typeof setInterval> | null = null;
const clearTimer = () => {
  if (timer) clearInterval(timer);
  timer = null;
};
const TICK = 0.1;

export const useCityStore = create<CityStore>((set, get) => {
  const applyEvents = (id: ScenarioId, from: number, to: number, inclusiveFrom: boolean) => {
    for (const e of SCENARIOS[id].events) {
      if ((inclusiveFrom ? e.t >= from : e.t > from) && e.t <= to) {
        set((st) => {
          const chips = { ...st.chips };
          if (e.chip) chips[e.code] = e.chip;
          else delete chips[e.code];
          return { states: { ...st.states, [e.code]: e.state }, chips };
        });
      }
    }
  };
  const ensureTimer = () => {
    if (timer) return;
    timer = setInterval(() => {
      const sc = get().scenario;
      if (!sc.id || sc.paused || sc.finished) return;
      const def = SCENARIOS[sc.id];
      const next = Math.min(sc.elapsed + TICK, def.total);
      applyEvents(sc.id, sc.elapsed, next, false);
      const finished = next >= def.total;
      set({ scenario: { ...sc, elapsed: next, finished } });
      if (finished) clearTimer();
    }, TICK * 1000);
  };

  return {
    states: allNormal(),
    chips: {},
    selected: null,
    hovered: null,
    scenario: IDLE,
    reasons: {},
    liveCache: null,
    applyLive: (c) => {
      set({ liveCache: c });
      if (get().source === "live") {
        set({
          states: Object.fromEntries(c.buildings.map((b) => [b.id, b.state])) as States,
          reasons: Object.fromEntries(c.buildings.map((b) => [b.id, { reasonVi: b.reasonVi, evidence: b.evidence[0] }])),
          chips: {},
        });
      }
    },
    goLive: () => {
      clearTimer();
      const c = get().liveCache;
      set({ source: "live", scenario: IDLE, chips: {} });
      if (c) get().applyLive(c);
      else set({ states: allNormal(), reasons: {} });
    },
    cards: true,
    setCards: (cards) => set({ cards }),
    shot: null,
    setShot: (shot) => set({ shot }),
    mode: "night",
    autoCycle: false,
    setMode: (mode) => set({ mode }),
    setAutoCycle: (autoCycle) => set({ autoCycle }),
    source: "live",
    setSource: (source) => set({ source }),
    setStates: (partial, chips) => set((st) => ({ states: { ...st.states, ...partial }, chips: chips ? { ...st.chips, ...chips } : st.chips })),
    select: (code) => set({ selected: code }),
    hover: (code) => set({ hovered: code }),
    setState: (code, s) =>
      set((st) => {
        const chips = { ...st.chips };
        delete chips[code];
        return { states: { ...st.states, [code]: s }, chips, source: "demo", reasons: st.source === "live" ? {} : st.reasons };
      }),
    resetAll: () => {
      clearTimer();
      set({ states: allNormal(), chips: {}, scenario: IDLE, source: "demo", reasons: {} });
    },
    startScenario: (id, at = 0, paused = false) => {
      clearTimer();
      set({ states: allNormal(), chips: {}, reasons: {}, source: "demo", scenario: { id, elapsed: at, paused, finished: false } });
      applyEvents(id, 0, at, true);
      if (at >= SCENARIOS[id].total) set({ scenario: { id, elapsed: at, paused: false, finished: true } });
      else ensureTimer();
    },
    togglePause: () => set((st) => (st.scenario.id && !st.scenario.finished ? { scenario: { ...st.scenario, paused: !st.scenario.paused } } : st)),
    stopScenario: () => get().resetAll(),
  };
});

/** Bridge for CityStage: pick/hover callbacks and flags the scene reads without React re-renders. */
export const stageHooks: {
  active: boolean;
  onPick?: (t: import("../stage/contract").PickTarget) => void;
  onHover?: (t: import("../stage/contract").PickTarget | null) => void;
} = { active: false };
