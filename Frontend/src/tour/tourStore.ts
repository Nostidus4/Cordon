// Tour state (zustand). `start()` always begins at the intro; the overlay performs the demo reset.
import { create } from "zustand";
import { TOUR_STEPS } from "./steps";

interface TourState {
  active: boolean; index: number; auto: boolean;
  start: (o?: { auto?: boolean; index?: number }) => void;
  stop: () => void;
  next: () => void; prev: () => void; goto: (i: number) => void;
  setAuto: (v: boolean) => void;
}
const clamp = (i: number) => Math.max(0, Math.min(TOUR_STEPS.length - 1, i));

export const useTourStore = create<TourState>((set, get) => ({
  active: false, index: 0, auto: false,
  start: (o) => set({ active: true, index: clamp(o?.index ?? 0), auto: !!o?.auto }),
  stop: () => set({ active: false, auto: false, index: 0 }),
  next: () => { const { index } = get(); if (index >= TOUR_STEPS.length - 1) set({ active: false, auto: false, index: 0 }); else set({ index: index + 1 }); },
  prev: () => set((s) => ({ index: clamp(s.index - 1) })),
  goto: (i) => set({ index: clamp(i) }),
  setAuto: (auto) => set({ auto }),
}));

/** Start from anywhere (⌘K entry, TopBar button, console): `startTour()` or `window.dispatchEvent(new Event("guardian:start-tour"))`. */
export const startTour = (o?: { auto?: boolean; index?: number }) => useTourStore.getState().start(o);
export const START_TOUR_EVENT = "guardian:start-tour";
