import { useEffect, useRef } from "react";
import { useAudioStore } from "./audioStore";
import { engine } from "./engine";
import { sfx } from "./sounds";

/** `{ sfx, enabled, unlock }`: call `sfx.xxx()` from handlers/effects. Cues are no-ops until the first user gesture (browser autoplay policy). */
export function useSound() {
  const enabled = useAudioStore((s) => s.enabled);
  return { sfx, enabled, unlock: () => engine.unlock() };
}

/** Run `fn` when `cond` goes false -> true (and on mount if `cond` is already true and `onMount` is set). */
export function useCueOnRise(cond: boolean, fn: () => void, onMount = false) {
  const prev = useRef<boolean | null>(null);
  const f = useRef(fn); f.current = fn;
  useEffect(() => {
    if (cond && (prev.current === false || (prev.current === null && onMount))) f.current();
    prev.current = cond;
  }, [cond, onMount]);
}

/** Run `fn(n)` whenever `n` grows compared with the previous value. The first real value (not null) is the baseline: no cue for data that was already there. */
export function useCueOnIncrease(n: number | null, fn: (n: number) => void) {
  const prev = useRef<number | null>(null);
  const f = useRef(fn); f.current = fn;
  useEffect(() => {
    if (n === null) return;
    if (prev.current !== null && n > prev.current) f.current(n);
    prev.current = n;
  }, [n]);
}
