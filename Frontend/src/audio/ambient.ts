// Very soft ambient bed: filtered noise "water" + "wind", a slow pad, and sparse birds (day) / crickets + owl (night).
// Everything is a handful of always-on nodes plus occasional one-shot oscillators, so CPU stays negligible.
import type { AudioEngine } from "./engine";

export interface Ambient {
  start(night: boolean): void;
  stop(fast?: boolean): void;
  setNight(night: boolean): void;
}

const DAY_PAD = [130.81, 196.0, 329.63]; // C3 G3 E4
const NIGHT_PAD = [110.0, 164.81, 261.63]; // A2 E3 C4 (softer, a little melancholic)
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function createAmbient(e: AudioEngine): Ambient {
  let running = false;
  let night = false;
  let nodes: AudioNode[] = [];
  let sources: (AudioScheduledSourceNode)[] = [];
  let pad: OscillatorNode[] = [];
  let dayBus: GainNode | null = null;
  let nightBus: GainNode | null = null;
  let level: GainNode | null = null;
  let timers: number[] = [];

  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
  const later = (fn: () => void, ms: number) => { timers.push(window.setTimeout(fn, ms)); };

  function chirp() {
    if (!running || night || !e.ctx || !e.ambientBus) return;
    const t = e.ctx.currentTime + 0.02;
    const base = rand(2600, 3600);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) e.tone({ f: base * rand(0.9, 1.1), to: base * rand(1.15, 1.35), glide: 0.06, t: t + i * 0.11, dur: 0.09, gain: 0.035, dest: e.ambientBus });
    later(chirp, rand(3500, 9000));
  }
  function cricket() {
    if (!running || !night || !e.ctx || !e.ambientBus) return;
    const t = e.ctx.currentTime + 0.02;
    const n = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) e.tone({ f: 4300, t: t + i * 0.075, dur: 0.05, gain: 0.02, a: 0.01, dest: e.ambientBus });
    later(cricket, rand(1800, 4500));
  }
  function owl() {
    if (!running || !night || !e.ctx || !e.ambientBus) return;
    const t = e.ctx.currentTime + 0.02;
    e.tone({ f: 420, to: 370, glide: 0.25, t, dur: 0.4, gain: 0.04, a: 0.08, lp: 900, dest: e.ambientBus });
    e.tone({ f: 400, to: 340, glide: 0.3, t: t + 0.55, dur: 0.5, gain: 0.035, a: 0.08, lp: 900, dest: e.ambientBus });
    later(owl, rand(16000, 32000));
  }
  const schedule = () => {
    clearTimers();
    if (!running) return;
    if (night) { later(cricket, 600); later(owl, rand(5000, 12000)); } else later(chirp, 1200);
  };

  function build() {
    const ctx = e.ctx!, bus = e.ambientBus!;
    level = ctx.createGain(); level.gain.value = 0.0001; level.connect(bus);
    dayBus = ctx.createGain(); nightBus = ctx.createGain();
    dayBus.connect(level); nightBus.connect(level);

    const lfo = (rate: number, depth: number, target: AudioParam) => {
      const o = ctx.createOscillator(); o.frequency.value = rate;
      const g = ctx.createGain(); g.gain.value = depth;
      o.connect(g); g.connect(target); o.start();
      sources.push(o); nodes.push(g);
    };
    // water: low-passed noise with a slow swell
    const w = e.noiseSource()!;
    const wf = ctx.createBiquadFilter(); wf.type = "lowpass"; wf.frequency.value = 420; wf.Q.value = 0.4;
    const wg = ctx.createGain(); wg.gain.value = 0.1;
    w.connect(wf); wf.connect(wg); wg.connect(level); w.start();
    lfo(0.13, 0.04, wg.gain);
    sources.push(w); nodes.push(wf, wg);
    // wind (day only, fainter at night): band-passed noise with a drifting centre
    const wi = e.noiseSource()!;
    const wif = ctx.createBiquadFilter(); wif.type = "bandpass"; wif.frequency.value = 700; wif.Q.value = 0.7;
    const wig = ctx.createGain(); wig.gain.value = 0.05;
    wi.connect(wif); wif.connect(wig); wig.connect(dayBus); wi.start();
    lfo(0.07, 260, wif.frequency); lfo(0.05, 0.02, wig.gain);
    sources.push(wi); nodes.push(wif, wig);
    // pad: three sines through a low-pass, glides between a day and a night chord
    const pf = ctx.createBiquadFilter(); pf.type = "lowpass"; pf.frequency.value = 900;
    const pg = ctx.createGain(); pg.gain.value = 0.035;
    pf.connect(pg); pg.connect(level);
    pad = DAY_PAD.map((f, i) => {
      const o = ctx.createOscillator(); o.type = i === 2 ? "triangle" : "sine"; o.frequency.value = f; o.detune.value = i * 3 - 3;
      const g = ctx.createGain(); g.gain.value = 1 / DAY_PAD.length;
      o.connect(g); g.connect(pf); o.start(); sources.push(o); nodes.push(g);
      return o;
    });
    lfo(0.09, 0.015, pg.gain);
    nodes.push(pf, pg);
    nightBus.gain.value = 0; dayBus.gain.value = 1;
  }

  function applyNight(fast = false) {
    const ctx = e.ctx;
    if (!ctx || !dayBus || !nightBus) return;
    const t = ctx.currentTime, k = fast ? 0.05 : 0.9;
    dayBus.gain.setTargetAtTime(night ? 0.35 : 1, t, k);
    nightBus.gain.setTargetAtTime(night ? 1 : 0, t, k);
    (night ? NIGHT_PAD : DAY_PAD).forEach((f, i) => pad[i]?.frequency.setTargetAtTime(f, t, 1.2));
  }

  function teardown() {
    sources.forEach((s) => { try { s.stop(); } catch { /* already stopped */ } });
    nodes.forEach((n) => { try { n.disconnect(); } catch { /* ignore */ } });
    try { level?.disconnect(); dayBus?.disconnect(); nightBus?.disconnect(); } catch { /* ignore */ }
    sources = []; nodes = []; pad = []; level = dayBus = nightBus = null;
  }

  return {
    start(n) {
      night = n;
      if (running) { applyNight(); level?.gain.setTargetAtTime(0.9, e.ctx!.currentTime, 0.8); return; }
      if (!e.ctx || !e.ambientBus) return;
      running = true;
      if (level) teardown(); // a previous fade-out that has not been torn down yet
      build();
      applyNight(true);
      level!.gain.setTargetAtTime(0.9, e.ctx.currentTime, 1.2); // fade in
      schedule();
    },
    stop(fast) {
      if (!running) return;
      running = false;
      clearTimers();
      const ctx = e.ctx;
      if (ctx && level) {
        level.gain.setTargetAtTime(0.0001, ctx.currentTime, fast ? 0.05 : 0.4);
        window.setTimeout(() => { if (!running) teardown(); }, fast ? 300 : 2000);
      } else teardown();
    },
    setNight(n) {
      if (n === night) return;
      night = n;
      if (running) { applyNight(); schedule(); }
    },
  };
}
