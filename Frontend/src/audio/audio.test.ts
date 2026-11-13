import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateLimiter, createVoicePool } from "./limiter";
import { attemptCue } from "./cueMap";

describe("rate limiter", () => {
  it("allows a cue once per gap and tracks keys independently", () => {
    let t = 1000;
    const l = createRateLimiter(() => t);
    expect(l.allow("click", 60)).toBe(true);
    t += 30; expect(l.allow("click", 60)).toBe(false);
    expect(l.allow("pop", 60)).toBe(true);
    t += 31; expect(l.allow("click", 60)).toBe(true);
  });
  it("a refused call does not extend the window", () => {
    let t = 0;
    const l = createRateLimiter(() => t);
    l.allow("k", 100);
    t = 90; l.allow("k", 100);
    t = 101; expect(l.allow("k", 100)).toBe(true);
  });
});

describe("voice pool", () => {
  it("caps simultaneous cues and frees slots as audio time passes", () => {
    const p = createVoicePool(3);
    expect([p.claim(0, 1), p.claim(0, 1), p.claim(0, 2), p.claim(0, 1)]).toEqual([true, true, true, false]);
    expect(p.claim(1.5, 1)).toBe(true); // two 1 s cues ended
    expect(p.claim(1.5, 1, true)).toBe(true); // force bypasses the cap
  });
});

describe("attempt -> cue", () => {
  const base = { reasonCode: null, signer: "key_minh", action: "pay" as const };
  it("maps outcomes and reason codes", () => {
    expect(attemptCue({ ...base, outcome: "ok" })).toBe("coin");
    expect(attemptCue({ ...base, outcome: "ok", signer: "key_agent_rebalance", action: "swap" })).toBe("coinRich");
    expect(attemptCue({ ...base, outcome: "ok", action: "lock" })).toBe("lock");
    expect(attemptCue({ ...base, outcome: "reverted", reasonCode: "DISTRICT_DAILY_CAP" })).toBe("clang");
    expect(attemptCue({ ...base, outcome: "reverted", reasonCode: "PROTOCOL_NOT_ALLOWED" })).toBe("bonk");
    expect(attemptCue({ ...base, outcome: "blocked_at_protocol", reasonCode: "BLOCKED_AT_PROTOCOL" })).toBe("fizzle");
  });
});

// ---- store persistence + engine with a mocked AudioContext (node env: no DOM, so stub the few globals)
function fakeStorage(initial: Record<string, string> = {}, broken = false) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => { if (broken) throw new Error("denied"); return m.get(k) ?? null; },
    setItem: (k: string, v: string) => { if (broken) throw new Error("denied"); m.set(k, v); },
    _m: m,
  };
}
const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() });
const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: param(), frequency: param(), Q: param(), detune: param(), start: vi.fn(), stop: vi.fn(), type: "", threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() });
function fakeContext() {
  const ctx = {
    state: "suspended" as string, currentTime: 0, sampleRate: 8000, destination: node(),
    resume: vi.fn(async () => { ctx.state = "running"; }), suspend: vi.fn(async () => { ctx.state = "suspended"; }),
    createGain: vi.fn(node), createOscillator: vi.fn(node), createBiquadFilter: vi.fn(node), createDynamicsCompressor: vi.fn(node),
    createBufferSource: vi.fn(() => ({ ...node(), buffer: null, loop: false })),
    createBuffer: vi.fn((_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) })),
  };
  return ctx;
}

describe("audio store persistence", () => {
  beforeEach(() => { vi.resetModules(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("defaults: sound on, moderate volume, ambient off", async () => {
    vi.stubGlobal("localStorage", fakeStorage());
    const { useAudioStore, volumeToGain } = await import("./audioStore");
    const s = useAudioStore.getState();
    expect([s.enabled, s.volume, s.ambient]).toEqual([true, 0.6, false]);
    expect(20 * Math.log10(volumeToGain(0.6))).toBeCloseTo(-16, 5);
    expect(volumeToGain(0)).toBe(0);
    expect(volumeToGain(1)).toBe(1);
  });
  it("saves changes and restores them in a fresh module instance", async () => {
    const st = fakeStorage();
    vi.stubGlobal("localStorage", st);
    const a = await import("./audioStore");
    a.useAudioStore.getState().setEnabled(false);
    a.useAudioStore.getState().setVolume(0.3);
    a.useAudioStore.getState().setAmbient(true);
    expect(JSON.parse(st._m.get(a.STORAGE_KEY)!)).toEqual({ enabled: false, volume: 0.3, ambient: true });
    vi.resetModules();
    const b = await import("./audioStore");
    expect(b.useAudioStore.getState()).toMatchObject({ enabled: false, volume: 0.3, ambient: true });
  });
  it("survives corrupt data and blocked storage", async () => {
    vi.stubGlobal("localStorage", fakeStorage({ "guardian.audio.v1": "{nope" }));
    const a = await import("./audioStore");
    expect(a.useAudioStore.getState().volume).toBe(0.6);
    vi.resetModules();
    vi.stubGlobal("localStorage", fakeStorage({}, true));
    const b = await import("./audioStore");
    expect(() => b.useAudioStore.getState().setVolume(0.2)).not.toThrow();
    expect(b.useAudioStore.getState().volume).toBe(0.2);
  });
  it("clamps stored volume", async () => {
    vi.stubGlobal("localStorage", fakeStorage({ "guardian.audio.v1": JSON.stringify({ enabled: true, volume: 9, ambient: "x" }) }));
    const a = await import("./audioStore");
    expect(a.useAudioStore.getState()).toMatchObject({ volume: 1, ambient: false });
  });
});

describe("engine with a mocked AudioContext", () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal("localStorage", fakeStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  async function make() {
    const ctx = fakeContext();
    let now = 0;
    const { AudioEngine } = await import("./engine");
    const { useAudioStore } = await import("./audioStore");
    const e = new AudioEngine({ createContext: () => ctx as unknown as AudioContext, now: () => now });
    return { e, ctx, store: useAudioStore, tick: (ms: number) => { now += ms; } };
  }

  it("does nothing before the first gesture, plays after unlock", async () => {
    const { e, ctx } = await make();
    const fn = vi.fn();
    expect(e.play("a", { dur: 0.1 }, fn)).toBe(false);
    expect(ctx.createGain).not.toHaveBeenCalled(); // lazily created
    expect(e.unlock()).toBe(true);
    expect(ctx.resume).toHaveBeenCalled();
    expect(e.play("a", { dur: 0.1 }, fn)).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("rate-limits an identical cue and respects mute", async () => {
    const { e, store, tick } = await make();
    e.unlock();
    const fn = vi.fn();
    expect(e.play("click", { dur: 0.05, gap: 60 }, fn)).toBe(true);
    expect(e.play("click", { dur: 0.05, gap: 60 }, fn)).toBe(false);
    tick(61);
    expect(e.play("click", { dur: 0.05, gap: 60 }, fn)).toBe(true);
    store.getState().setEnabled(false);
    tick(100);
    expect(e.play("click", { dur: 0.05, gap: 60 }, fn)).toBe(false);
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it("caps polyphony at 8 simultaneous cues", async () => {
    const { e } = await make();
    e.unlock();
    const results = Array.from({ length: 10 }, (_, i) => e.play(`c${i}`, { dur: 1 }, () => {}));
    expect(results.filter(Boolean)).toHaveLength(8);
    expect(e.play("forced", { dur: 1, force: true }, () => {})).toBe(true);
  });
  it("sets master gain from the volume preference and pauses while the tab is hidden", async () => {
    const { e, store, ctx } = await make();
    const docListeners: Record<string, () => void> = {};
    vi.stubGlobal("document", { hidden: false, addEventListener: (n: string, f: () => void) => { docListeners[n] = f; } });
    e.unlock();
    ctx.state = "running";
    store.getState().setVolume(1);
    expect(e.master!.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 0, 0.03);
    vi.stubGlobal("document", { hidden: true });
    docListeners.visibilitychange();
    expect(ctx.suspend).toHaveBeenCalled();
    expect(e.play("x", { dur: 0.1 }, () => {})).toBe(false);
  });
});
