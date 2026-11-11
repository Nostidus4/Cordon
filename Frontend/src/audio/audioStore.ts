// Sound preferences (zustand), persisted to localStorage. Every storage access is wrapped: private windows / blocked storage must not break the app.
import { create } from "zustand";

export interface AudioPrefs {
  enabled: boolean;
  /** 0..1 slider position, mapped to dB by volumeToGain */
  volume: number;
  ambient: boolean;
}
export const DEFAULT_PREFS: AudioPrefs = { enabled: true, volume: 0.6, ambient: false };
export const STORAGE_KEY = "guardian.audio.v1";

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : DEFAULT_PREFS.volume);

/** Slider 0..1 -> linear gain: 0 = silent, 1 = 0 dB, 0.6 = -16 dB (the default), 0.55 = -18 dB. */
export const volumeToGain = (v: number): number => (v <= 0 ? 0 : Math.pow(10, (-40 * (1 - clamp01(v))) / 20));

const storage = (): Storage | null => {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
};

export function loadPrefs(): AudioPrefs {
  try {
    const raw = storage()?.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const p = JSON.parse(raw) as Partial<AudioPrefs>;
    return {
      enabled: typeof p.enabled === "boolean" ? p.enabled : DEFAULT_PREFS.enabled,
      volume: typeof p.volume === "number" ? clamp01(p.volume) : DEFAULT_PREFS.volume,
      ambient: typeof p.ambient === "boolean" ? p.ambient : DEFAULT_PREFS.ambient,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}
export function savePrefs(p: AudioPrefs): void {
  try { storage()?.setItem(STORAGE_KEY, JSON.stringify({ enabled: p.enabled, volume: p.volume, ambient: p.ambient })); } catch { /* storage unavailable: preferences just do not persist */ }
}

interface AudioStore extends AudioPrefs {
  setEnabled: (v: boolean) => void;
  toggleEnabled: () => void;
  setVolume: (v: number) => void;
  setAmbient: (v: boolean) => void;
}

export const useAudioStore = create<AudioStore>((set, get) => ({
  ...loadPrefs(),
  setEnabled: (enabled) => set({ enabled }),
  toggleEnabled: () => set({ enabled: !get().enabled }),
  setVolume: (volume) => set({ volume: clamp01(volume) }),
  setAmbient: (ambient) => set({ ambient }),
}));
useAudioStore.subscribe((s, p) => {
  if (s.enabled !== p.enabled || s.volume !== p.volume || s.ambient !== p.ambient) savePrefs(s);
});
