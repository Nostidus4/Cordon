// Anti-spam guards for the sound engine: per-cue minimum gap and a cap on simultaneous cues.

/** `allow(key, gapMs)` is true at most once per `gapMs` for the same key. Time source is injected for tests. */
export function createRateLimiter(now: () => number) {
  const last = new Map<string, number>();
  return {
    allow(key: string, gapMs: number): boolean {
      const t = now();
      const p = last.get(key);
      if (p !== undefined && t - p < gapMs) return false;
      last.set(key, t);
      return true;
    },
    reset() { last.clear(); },
  };
}

/** At most `max` cues sounding at once; each claim holds a slot for `durSec` of audio-clock time. */
export function createVoicePool(max: number) {
  let ends: number[] = [];
  return {
    claim(nowSec: number, durSec: number, force = false): boolean {
      ends = ends.filter((e) => e > nowSec);
      if (ends.length >= max && !force) return false;
      ends.push(nowSec + durSec);
      return true;
    },
    active(nowSec: number): number { return ends.filter((e) => e > nowSec).length; },
  };
}
