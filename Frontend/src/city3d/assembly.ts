import { create } from "zustand";

/**
 * "The city assembles itself" while assets arrive: island rises from the water, buildings pop up one after another
 * (springy squash-and-stretch), trees/lamps/flowers/boats sprout, surroundings rise, then lamps and windows switch on.
 * Pure timeline (times in seconds, injected `now`) so it can be unit tested; <Assembly/> drives it from the render loop.
 */
export const POP_ORDER = ["B08", "B01", "B03", "B02", "B06", "B07", "B04", "B05"]; // plaza, council, vault, then clockwise
export const CLUSTERS = ["trees", "lamps", "flowers", "boats"] as const;
export type Cluster = (typeof CLUSTERS)[number];

export const T = { rise: 0.9, pop: 0.45, stagger: 0.12, sprout: 0.6, sproutStep: 0.14, surr: 0.8, deadline: 8, gate: 12, armLead: 0.15 };

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOutCubic = (u: number) => 1 - Math.pow(1 - u, 3);
const smooth = (u: number) => u * u * (3 - 2 * u);
const easeOutBack = (x: number) => 1 + 2.4 * Math.pow(x - 1, 3) + 1.4 * Math.pow(x - 1, 2);

export interface PopValue {
  visible: boolean;
  /** vertical scale (0 -> 1.08 -> 1) */
  sy: number;
  /** horizontal scale (squash/stretch counter-motion) */
  sxz: number;
  /** 0..1 progress of the landing puff (dust + sparkles), >= 1 when finished */
  u: number;
}

export interface TimelineOptions {
  /** asset keys that will report ready: "base", "surr", "B01".."B08" */
  expected: string[];
  reduced?: boolean;
  /** night amount 0..1 sampled when the lights start (night: quick cascade, day: soft sweep) */
  night?: () => number;
  /** wait for `arm()` (the visitor taps "Bước vào thành phố") before anything starts; assembles silently anyway after T.gate seconds */
  gated?: boolean;
}

export class Timeline {
  readonly expected: Set<string>;
  readonly reduced: boolean;
  private ready = new Set<string>();
  baseAt = -1;
  surrAt = -1;
  lightsAt = -1;
  doneAt = -1;
  private slot = 0;
  private popAt = new Map<string, number>();
  private sproutAt = new Map<Cluster, number>();
  private lightStep = 0.05;
  private lightDur = 0.25;
  private born = -1;
  private nightFn: () => number;
  /** false while waiting for the visitor's tap */
  armed: boolean;
  private startAt = 0;
  private gateSince = -1;

  constructor(o: TimelineOptions) {
    this.expected = new Set(o.expected);
    this.reduced = !!o.reduced;
    this.nightFn = o.night ?? (() => 1);
    this.armed = !o.gated || this.reduced;
  }

  /** The visitor tapped: start (a hair later, so the audio context is running) and restart the deadline clock. */
  arm(now: number) {
    if (this.armed) return;
    this.armed = true;
    this.startAt = now + (this.reduced ? 0 : T.armLead);
    this.born = now;
  }

  markReady(key: string) {
    this.ready.add(key);
  }
  get finished() {
    return this.doneAt >= 0;
  }

  private has(key: string) {
    return !this.expected.has(key) || this.ready.has(key);
  }

  /** Advance the schedule (idempotent). Cheap: call every frame until `finished`. */
  update(now: number) {
    if (this.born < 0) this.born = now;
    if (!this.armed) {
      if (this.gateSince < 0 && this.has("base")) this.gateSince = now;
      const stuck = this.gateSince >= 0 ? now - this.gateSince > T.gate : now - this.born > T.deadline + T.gate;
      if (!stuck) return;
      this.arm(now); // nobody tapped: assemble silently so the page never feels stuck
    }
    if (now < this.startAt) return;
    const timedOut = now - this.born > T.deadline;
    const r = this.reduced;
    if (this.baseAt < 0 && (this.has("base") || timedOut)) {
      this.baseAt = now;
      this.slot = now + (r ? 0 : 0.35); // buildings start while the island is still settling
      CLUSTERS.forEach((c, i) => this.sproutAt.set(c, now + (r ? 0 : 0.45 + i * T.sproutStep)));
    }
    if (this.baseAt < 0) return;
    for (const code of POP_ORDER) {
      if (!this.expected.has(code) || this.popAt.has(code) || !this.ready.has(code)) continue;
      const at = Math.max(now, this.slot);
      this.popAt.set(code, at);
      this.slot = at + (r ? 0 : T.stagger);
    }
    const bldDone = timedOut || POP_ORDER.every((c) => !this.expected.has(c) || this.popAt.has(c));
    if (this.surrAt < 0 && bldDone && (this.has("surr") || timedOut)) {
      this.surrAt = Math.max(now, this.slot);
      this.slot = this.surrAt + (r ? 0 : 0.1);
    }
    const surrDone = this.surrAt >= 0 || !this.expected.has("surr");
    if (this.lightsAt < 0 && bldDone && surrDone) {
      const lastPop = Math.max(this.baseAt, ...this.popAt.values());
      if (r) this.lightsAt = now;
      else this.lightsAt = Math.max(now, lastPop + T.pop * 0.8, this.baseAt + T.rise, this.surrAt >= 0 ? this.surrAt + 0.3 : 0);
      const night = this.nightFn() > 0.5;
      this.lightStep = night ? 0.05 : 0.06;
      this.lightDur = night ? 0.25 : 0.5;
      this.doneAt = r ? now + 0.3 : this.lightsAt + POP_ORDER.length * this.lightStep + this.lightDur;
    }
  }

  /** island (base glb) rise: 0 hidden under water -> 1 in place. */
  island(now: number) {
    if (this.reduced) return this.baseAt < 0 ? 0 : 1;
    if (this.baseAt < 0) return 0;
    return easeOutCubic(clamp01((now - this.baseAt) / T.rise));
  }
  /** surroundings rise (islets, houses, boats). */
  surroundings(now: number) {
    if (this.surrAt < 0) return this.expected.has("surr") ? 0 : 1;
    return this.reduced ? 1 : easeOutCubic(clamp01((now - this.surrAt) / T.surr));
  }
  pop(code: string, now: number): PopValue {
    if (!this.expected.has(code)) return { visible: true, sy: 1, sxz: 1, u: 1 };
    const at = this.popAt.get(code);
    if (at === undefined || now < at) return { visible: false, sy: 0, sxz: 0, u: 0 };
    if (this.reduced) return { visible: true, sy: 1, sxz: 1, u: 1 };
    const u = clamp01((now - at) / T.pop);
    const sy = u < 0.6 ? easeOutCubic(u / 0.6) * 1.08 : 1.08 - 0.08 * smooth((u - 0.6) / 0.4);
    const sxz = easeOutCubic(clamp01(u * 1.25)) * (1 - 0.5 * (sy - 1));
    return { visible: true, sy: Math.max(sy, 0.001), sxz: Math.max(sxz, 0.001), u: clamp01((now - at) / 0.9) };
  }
  /** time the building starts popping (for particles), -1 if not yet scheduled */
  popStart(code: string) {
    return this.popAt.get(code) ?? -1;
  }
  /** time the cluster starts sprouting, -1 if not yet scheduled */
  sproutStart(c: Cluster) {
    return this.sproutAt.get(c) ?? -1;
  }
  sprout(c: Cluster, now: number) {
    const at = this.sproutAt.get(c);
    if (at === undefined) return 0;
    if (this.reduced) return 1;
    return Math.max(0.001, easeOutBack(clamp01((now - at) / T.sprout)));
  }
  /** 0..1 fade-in of ambient life (traffic, fireflies) once the island is in place. */
  life(now: number) {
    if (this.baseAt < 0) return 0;
    return this.reduced ? 1 : smooth(clamp01((now - this.baseAt - T.rise) / 0.4));
  }
  /** lamps / windows switch-on factor for consumer `idx` (night: quick flicker-overshoot cascade, day: soft sweep). */
  lit(idx: number, now: number) {
    if (this.lightsAt < 0) return 0;
    if (this.reduced) return 1;
    const e = now - this.lightsAt - idx * this.lightStep;
    if (e <= 0) return 0;
    const u = clamp01(e / this.lightDur);
    if (this.lightDur > 0.4) return smooth(u); // day sweep (no overshoot)
    return u < 0.6 ? (u / 0.6) * 1.3 : 1.3 - 0.3 * ((u - 0.6) / 0.4);
  }
}

// ---------------------------------------------------------------- runtime singleton

interface AssemblyState {
  /** true once the assembly animation (incl. the lights cascade) has finished: the stage shows its cards from here. */
  assembled: boolean;
  /** a timeline exists and has not finished yet */
  running: boolean;
}
export const useAssembly = create<AssemblyState>(() => ({ assembled: false, running: false }));

export let timeline: Timeline | null = null;
export const nowS = () => performance.now() / 1000;
/** Helpers for consumers: without a running timeline everything is simply "in place / on". */
export const litAt = (idx: number) => (timeline ? timeline.lit(idx, nowS()) : 1);
export const lifeAt = () => (timeline ? timeline.life(nowS()) : 1);

/** Stage: is the "Bước vào thành phố" tap required before the city assembles? Set before the 3D runtime mounts. */
let gateRequired = false;
let armed = false;
export const setAssemblyGate = (required: boolean) => { gateRequired = required; if (!required) armed = true; };
/** The visitor tapped (or the stage skipped the gate): the assembly may start now. Remembered for the page's lifetime. */
export function armAssembly() {
  armed = true;
  timeline?.arm(nowS());
}

export function startAssembly(o: TimelineOptions) {
  timeline = new Timeline({ ...o, gated: gateRequired && !armed });
  useAssembly.setState({ assembled: false, running: true });
}
export function resetAssembly() {
  timeline = null;
  useAssembly.setState({ assembled: false, running: false });
}
/** Components call this when their asset is in the scene ("base", "surr", "B01".."B08"). Safe before startAssembly. */
const early = new Set<string>();
export function markReady(key: string) {
  if (timeline) timeline.markReady(key);
  else early.add(key);
}
/** Drive from the render loop every frame (late assets still get scheduled); returns true while not yet assembled. */
export function tickAssembly(now = nowS()): boolean {
  const tl = timeline;
  if (!tl) return false;
  early.forEach((k) => tl.markReady(k));
  early.clear();
  tl.update(now);
  if (tl.finished && now >= tl.doneAt && !useAssembly.getState().assembled) useAssembly.setState({ assembled: true, running: false });
  return !useAssembly.getState().assembled;
}
/** Call `cb` once the city is fully assembled (immediately if it already is). Returns an unsubscribe fn. */
export function onAssembled(cb: () => void): () => void {
  if (useAssembly.getState().assembled) {
    cb();
    return () => {};
  }
  const unsub = useAssembly.subscribe((s) => {
    if (s.assembled) {
      unsub();
      cb();
    }
  });
  return unsub;
}
