// UI state: demoMode, Live/Replay, selected principals, highlight from assistant, toasts, command palette.
import { create } from "zustand";

export type ToastKind = "success" | "error" | "warning" | "info";
export interface ToastAction { label: string; onClick: () => void }
export interface ToastItem { id: number; kind: ToastKind; title: string; description?: string; duration: number; action?: ToastAction }
export interface Highlight { nodeIds: string[]; edgeIds: string[] }

interface UiState {
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
  mode: "live" | "replay";
  setMode: (m: "live" | "replay") => void;
  replayRunId: string | null;
  setReplayRunId: (id: string | null) => void;
  /** Principals chosen on Simulate (default minh). Shared so Map "Thử xem →" can preselect. */
  selectedPrincipals: string[];
  setSelectedPrincipals: (ids: string[]) => void;
  togglePrincipal: (id: string) => void;
  /** Highlight pushed by the assistant (gold outline on canvas). */
  highlight: Highlight;
  setHighlight: (h: Highlight) => void;
  clearHighlight: () => void;
  selectedNodeId: string | null;
  selectNode: (id: string | null) => void;
  paletteOpen: boolean;
  setPaletteOpen: (v: boolean) => void;
  toasts: ToastItem[];
  pushToast: (t: Omit<ToastItem, "id" | "duration"> & { duration?: number }) => number;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;
const DEDUPE_MS = 1500;
const recentToasts = new Map<string, { id: number; at: number }>();
export const useUiStore = create<UiState>((set) => ({
  demoMode: true,
  setDemoMode: (demoMode) => set({ demoMode }),
  mode: "live",
  setMode: (mode) => set({ mode }),
  replayRunId: null,
  setReplayRunId: (replayRunId) => set({ replayRunId }),
  selectedPrincipals: ["minh"],
  setSelectedPrincipals: (selectedPrincipals) => set({ selectedPrincipals }),
  togglePrincipal: (id) =>
    set((s) => {
      const has = s.selectedPrincipals.includes(id);
      if (has && s.selectedPrincipals.length === 1) return s;
      return { selectedPrincipals: has ? s.selectedPrincipals.filter((x) => x !== id) : [...s.selectedPrincipals, id].slice(-2) };
    }),
  highlight: { nodeIds: [], edgeIds: [] },
  setHighlight: (highlight) => set({ highlight }),
  clearHighlight: () => set({ highlight: { nodeIds: [], edgeIds: [] } }),
  selectedNodeId: null,
  selectNode: (selectedNodeId) => set({ selectedNodeId }),
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  toasts: [],
  pushToast: (t) => {
    const now = Date.now();
    const prev = recentToasts.get(t.title);
    if (prev && now - prev.at < DEDUPE_MS) return prev.id; // identical title within 1.5 s shows once
    const id = ++toastSeq;
    recentToasts.set(t.title, { id, at: now });
    set((s) => ({ toasts: [...s.toasts, { duration: 5000, ...t, id }].slice(-5) }));
    return id;
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

/** Imperative toast helper usable outside React. */
export const toast = {
  success: (title: string, description?: string, action?: ToastAction) => useUiStore.getState().pushToast({ kind: "success", title, description, action }),
  error: (title: string, description?: string, action?: ToastAction) => useUiStore.getState().pushToast({ kind: "error", title, description, action, duration: 7000 }),
  warning: (title: string, description?: string, action?: ToastAction) => useUiStore.getState().pushToast({ kind: "warning", title, description, action }),
  info: (title: string, description?: string, action?: ToastAction) => useUiStore.getState().pushToast({ kind: "info", title, description, action }),
};
