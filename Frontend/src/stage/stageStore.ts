// Shared stage state: what the active scene wants the city to show, the "next recommended action" (Space), day/night, progress.
import { useEffect, useRef } from "react";
import { create } from "zustand";
import type { CityStageProps, PickTarget } from "./contract";
import type { StageScene } from "./logic";

interface StageStore {
  /** props the active scene contributes to CityStage (merged over the defaults in StagePage) */
  city: Partial<CityStageProps>;
  setCity: (c: Partial<CityStageProps>) => void;
  /** Space = run this */
  primary: (() => void) | null;
  setPrimary: (f: (() => void) | null) => void;
  /** null = automatic (night while the attack is running) */
  nightPref: boolean | null;
  setNightPref: (v: boolean | null) => void;
  autoNight: boolean;
  setAutoNight: (v: boolean) => void;
  picked: PickTarget | null;
  setPicked: (p: PickTarget | null) => void;
  reached: StageScene[];
  markReached: (s: StageScene) => void;
  clearReached: () => void;
  /** end card is open */
  preparing: boolean;
  setPreparing: (v: boolean) => void;
  ended: boolean;
  setEnded: (v: boolean) => void;
}

export const useStageStore = create<StageStore>((set) => ({
  city: {},
  setCity: (city) => set({ city }),
  primary: null,
  setPrimary: (primary) => set({ primary }),
  nightPref: null,
  setNightPref: (nightPref) => set({ nightPref }),
  autoNight: false,
  setAutoNight: (autoNight) => set({ autoNight }),
  picked: null,
  setPicked: (picked) => set({ picked }),
  reached: [],
  markReached: (s) => set((st) => (st.reached.includes(s) ? st : { reached: [...st.reached, s] })),
  clearReached: () => set({ reached: [] }),
  preparing: false,
  setPreparing: (preparing) => set({ preparing }),
  ended: false,
  setEnded: (ended) => set({ ended }),
}));

/** The active scene tells the city what to show. Pass a memoised object. */
export function useCityProps(props: Partial<CityStageProps>) {
  useEffect(() => { useStageStore.getState().setCity(props); }, [props]);
}

/** Register what Space does in this scene (latest closure wins). Pass null when nothing is recommended. */
export function usePrimaryAction(fn: (() => void) | null) {
  const ref = useRef(fn);
  ref.current = fn;
  const has = !!fn;
  useEffect(() => {
    useStageStore.getState().setPrimary(has ? () => ref.current?.() : null);
    return () => useStageStore.getState().setPrimary(null);
  }, [has]);
}
