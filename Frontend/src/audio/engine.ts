// Tiny Web Audio engine: lazy AudioContext (first user gesture), master volume (dB mapped), compressor, cue rate limit, polyphony cap,
// ambient ducking, pause while the tab is hidden. Every sound is synthesised from oscillators + a noise buffer: no audio files.
import { useAudioStore, volumeToGain } from "./audioStore";
import { createAmbient, type Ambient } from "./ambient";
import { createRateLimiter, createVoicePool } from "./limiter";

export const MAX_VOICES = 8;

export interface ToneOpts {
  f: number; t: number; dur: number;
  type?: OscillatorType;
  gain?: number;
  /** attack seconds */
  a?: number;
  /** glide the frequency to this value over the first `glide` seconds (default 0.08) */
  to?: number; glide?: number;
  /** low-pass cutoff in Hz, optionally swept to `lpTo` over the note */
  lp?: number; lpTo?: number;
  /** stereo position -1 (left) .. 1 (right) */
  pan?: number;
  dest?: AudioNode;
}
export interface NoiseOpts {
  t: number; dur: number; gain?: number; a?: number;
  type?: BiquadFilterType; f?: number; q?: number;
  /** sweep the filter to this frequency over the whole duration */
  fTo?: number;
  pan?: number;
  dest?: AudioNode;
}

export interface EngineDeps {
  createContext?: () => AudioContext;
  now?: () => number;
}

const defaultContext = (): AudioContext | null => {
  const w = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const C = w.AudioContext ?? w.webkitAudioContext;
  return C ? new C({ latencyHint: "interactive" }) : null;
};

export const reducedMotion = (): boolean => {
  try { return !!globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfxBus: GainNode | null = null;
  ambientBus: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private ambient: Ambient | null = null;
  private hidden = false;
  private night = false;
  private wired = false;
  readonly limiter;
  readonly voices = createVoicePool(MAX_VOICES);

  constructor(private deps: EngineDeps = {}) {
    this.limiter = createRateLimiter(deps.now ?? (() => performance.now()));
  }

  get ready(): boolean { return !!this.ctx; }
  get running(): boolean { return this.ctx?.state === "running"; }

  /** Create (first call) and resume the AudioContext. Call from a user gesture. Safe to call repeatedly. */
  unlock(): boolean {
    try {
      if (!this.ctx) {
        const ctx = this.deps.createContext ? this.deps.createContext() : defaultContext();
        if (!ctx) return false;
        this.ctx = ctx;
        this.build(ctx);
      }
      if (useAudioStore.getState().enabled && !this.hidden && this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
      this.syncAmbient();
      return true;
    } catch {
      return false;
    }
  }

  private build(ctx: AudioContext) {
    const master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    const sfx = ctx.createGain();
    sfx.connect(master);
    const duck = ctx.createGain();
    duck.connect(master);
    const amb = ctx.createGain();
    amb.connect(duck);
    this.master = master; this.sfxBus = sfx; this.duckGain = duck; this.ambientBus = amb;
    this.applyVolume();
    if (!this.wired) {
      this.wired = true;
      useAudioStore.subscribe(() => this.onPrefs());
      try { document.addEventListener("visibilitychange", () => this.onVisibility()); } catch { /* no document */ }
      this.hidden = typeof document !== "undefined" && document.hidden;
    }
  }

  private onPrefs() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.applyVolume();
    const { enabled } = useAudioStore.getState();
    if (enabled && !this.hidden && ctx.state === "suspended") void ctx.resume().catch(() => {});
    if (!enabled && ctx.state === "running") setTimeout(() => { if (!useAudioStore.getState().enabled) void ctx.suspend().catch(() => {}); }, 150);
    this.syncAmbient();
  }

  private onVisibility() {
    const ctx = this.ctx;
    if (!ctx) return;
    this.hidden = document.hidden;
    if (this.hidden) { void ctx.suspend().catch(() => {}); this.ambient?.stop(true); }
    else { if (useAudioStore.getState().enabled) void ctx.resume().catch(() => {}); this.syncAmbient(); }
  }

  private applyVolume() {
    if (!this.ctx || !this.master) return;
    const { enabled, volume } = useAudioStore.getState();
    this.master.gain.setTargetAtTime(enabled ? volumeToGain(volume) : 0, this.ctx.currentTime, 0.03);
  }

  // ---------------------------------------------------------------- ambient
  setNight(night: boolean) {
    this.night = night;
    this.ambient?.setNight(night);
  }
  private syncAmbient() {
    if (!this.ctx || !this.ambientBus) return;
    const { enabled, ambient } = useAudioStore.getState();
    const want = enabled && ambient && !this.hidden && !reducedMotion();
    if (!want) { this.ambient?.stop(); return; }
    if (!this.ambient) this.ambient = createAmbient(this);
    this.ambient.start(this.night);
  }

  /** Dip the ambient bed under a cue. */
  duck(amount = 0.45, holdMs = 280) {
    const g = this.duckGain?.gain, ctx = this.ctx;
    if (!g || !ctx) return;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(amount, t, 0.02);
    g.setTargetAtTime(1, t + holdMs / 1000, 0.25);
  }

  // ---------------------------------------------------------------- playing a cue
  /**
   * Run `fn` if audio is on and unlocked, the cue is not spamming (`gap` ms since the last `key`) and fewer than MAX_VOICES cues are sounding.
   * `fn(t)` receives the audio-clock time to start at (now + `delay` seconds). Returns whether it played.
   */
  play(key: string, o: { dur: number; gap?: number; delay?: number; force?: boolean; duck?: boolean }, fn: (t: number) => void): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !useAudioStore.getState().enabled || this.hidden) return false;
    if (!this.limiter.allow(key, o.gap ?? 60)) return false;
    const delay = o.delay ?? 0;
    if (!this.voices.claim(ctx.currentTime + delay, o.dur, o.force)) return false;
    try { fn(ctx.currentTime + delay + 0.005); } catch { return false; }
    if (o.duck !== false) this.duck();
    return true;
  }

  // ---------------------------------------------------------------- primitives
  /** Where a voice connects: the sfx bus, or a stereo panner in front of it. */
  private target(dest: AudioNode | undefined, pan: number | undefined): AudioNode {
    const bus = dest ?? this.sfxBus!;
    if (!pan || !this.ctx || typeof this.ctx.createStereoPanner !== "function") return bus;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(bus);
    return p;
  }

  tone(o: ToneOpts): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.f, o.t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, o.t + (o.glide ?? 0.08));
    const a = o.a ?? 0.004, peak = o.gain ?? 0.2;
    g.gain.setValueAtTime(0.0001, o.t);
    g.gain.linearRampToValueAtTime(peak, o.t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, o.t + Math.max(o.dur, a + 0.01));
    let node: AudioNode = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.setValueAtTime(o.lp, o.t);
      if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, o.t + o.dur);
      osc.connect(f); node = f;
    }
    node.connect(g); g.connect(this.target(o.dest, o.pan));
    osc.start(o.t); osc.stop(o.t + o.dur + 0.05);
  }

  noise(o: NoiseOpts): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const src = this.noiseSource();
    if (!src) return;
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? "bandpass"; f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.f ?? 1000, o.t);
    if (o.fTo) f.frequency.exponentialRampToValueAtTime(o.fTo, o.t + o.dur);
    const g = ctx.createGain();
    const a = o.a ?? 0.004;
    g.gain.setValueAtTime(0.0001, o.t);
    g.gain.linearRampToValueAtTime(o.gain ?? 0.2, o.t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, o.t + Math.max(o.dur, a + 0.01));
    src.connect(f); f.connect(g); g.connect(this.target(o.dest, o.pan));
    src.start(o.t, Math.random() * 0.8); src.stop(o.t + o.dur + 0.05);
  }

  /** A looping white-noise source (one shared 1.5 s buffer). */
  noiseSource(): AudioBufferSourceNode | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (!this.noiseBuf) {
      const len = Math.floor(ctx.sampleRate * 1.5);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf; s.loop = true;
    return s;
  }
}

export const engine = new AudioEngine();
