// Live-mode connection health: SSE open/closed + API reachability, and when we last heard from the server.
import { create } from "zustand";

interface ConnState {
  sseOpen: boolean;
  apiDown: boolean;
  /** Epoch ms of the last successful fetch or stream open (the "stored data as of" time). */
  lastOkAt: number;
  setSse: (open: boolean) => void;
  setApi: (ok: boolean) => void;
}

export const useConnStore = create<ConnState>((set) => ({
  sseOpen: true,
  apiDown: false,
  lastOkAt: Date.now(),
  setSse: (open) => set((s) => (open ? { sseOpen: true, lastOkAt: Date.now() } : s.sseOpen ? { sseOpen: false } : s)),
  setApi: (ok) => set((s) => (ok ? { apiDown: false, lastOkAt: Date.now() } : s.apiDown ? s : { apiDown: true })),
}));
