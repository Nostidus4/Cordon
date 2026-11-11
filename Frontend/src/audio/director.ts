// Wires the cues to what happens on screen, without scenes having to know: stores and the city assembly are observed here.
//   useAudioUnlock()  first-gesture unlock + soft click on every toy button/tab (also used by /he-thong)
//   useStageAudio()   + scene whoosh, assembly cues, day/night, spread pulse, attempt outcomes
import { useEffect, useRef } from "react";
import { CLUSTERS, POP_ORDER, nowS, timeline, useAssembly } from "../city3d/assembly";
import { getPlacement } from "../city3d/layout";
import type { SceneId } from "../stage/contract";
import { useStageStore } from "../stage/stageStore";
import type { Attempt } from "../types";
import { attemptCue } from "./cueMap";
import { engine } from "./engine";
import { sfx } from "./sounds";

const GESTURES = ["pointerdown", "pointerup", "click", "keydown", "touchend"] as const;
const ORDER: SceneId[] = ["intro", "look", "try", "fix", "incident", "request"];

/** Unlock the AudioContext on the first gesture and play a click for toy buttons / tabs (opt out with data-sfx="off"). */
export function useAudioUnlock() {
  useEffect(() => {
    const unlock = () => { engine.unlock(); };
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("button, [role=button], a.sx-tab");
      if (!el || !el.closest(".stage") || el.closest('[data-sfx="off"]')) return;
      sfx.click();
    };
    GESTURES.forEach((g) => document.addEventListener(g, unlock, { capture: true, passive: true }));
    document.addEventListener("click", onClick, true);
    return () => {
      GESTURES.forEach((g) => document.removeEventListener(g, unlock, true));
      document.removeEventListener("click", onClick, true);
    };
  }, []);
}

const PLAY: Record<ReturnType<typeof attemptCue>, () => unknown> = {
  coin: () => sfx.coin(), coinRich: () => sfx.coin(true), lock: () => sfx.lock(), bonk: () => sfx.bonk(), clang: () => sfx.clang(), fizzle: () => sfx.fizzle(),
};

/** Play cues for attempts that appeared since `seen`. A big jump (hydration after a fetch) is not a live event: stay silent. */
export function newAttempts(list: Attempt[], seen: Set<string>): Attempt[] {
  const fresh = list.filter((a) => !seen.has(a.id));
  seen.clear();
  list.forEach((a) => seen.add(a.id));
  return fresh.length > 3 ? [] : fresh;
}

export function useStageAudio(scene: SceneId, night: boolean) {
  useAudioUnlock();
  const sceneRef = useRef(scene); sceneRef.current = scene;
  const nightRef = useRef(night); nightRef.current = night;

  // scene change: whoosh (forward rises, back falls); also covers the ←/→ keys and the stepper
  const prev = useRef<SceneId | null>(null);
  useEffect(() => {
    const p = prev.current;
    if (p && p !== scene) sfx.whoosh(ORDER.indexOf(scene) >= ORDER.indexOf(p) ? 1 : -1);
    prev.current = scene;
  }, [scene]);

  // ambient bed follows day/night
  useEffect(() => { engine.setNight(night); }, [night]);

  // the user flips day/night: owl + crickets / birds
  useEffect(() => useStageStore.subscribe((s, p) => {
    if (s.nightPref !== p.nightPref && s.nightPref !== null) (s.nightPref ? sfx.nightSwell : sfx.daySwell)();
  }), []);

  // city assembly: island swell, one boing per building (staggered like the pop-in), sparkles, lights-on, "Xong!"
  useEffect(() => {
    let tl: typeof timeline = null;
    let base = false, lights = false;
    const pops = new Set<string>();
    const sprouts = new Set<string>();
    // screen-x of a building in the iso view (camera at (-1,1,1)) is proportional to x + z
    const panOf = (code: string) => { const [x, , z] = getPlacement(code).position; return Math.max(-0.7, Math.min(0.7, (x + z) / 60)); };
    const poll = () => {
      const t = timeline;
      if (!t || useAssembly.getState().assembled) return;
      if (t !== tl) { tl = t; base = false; lights = false; pops.clear(); sprouts.clear(); }
      const now = nowS();
      const lead = (at: number) => Math.max(0, at - now);
      if (t.reduced || !t.armed) return; // reduced motion: everything appears at once, only the final chord plays
      if (t.baseAt >= 0 && !base) { base = true; sfx.islandRise({ delay: lead(t.baseAt) }); }
      // each building's sound is scheduled on the audio clock at exactly its popStart
      POP_ORDER.forEach((code, i) => {
        const at = t.popStart(code);
        if (at < 0 || pops.has(code)) return;
        pops.add(code);
        sfx.buildingPop(i, panOf(code), { delay: lead(at) });
        if (pops.size === 4) sfx.sparkle({ delay: lead(at) + 0.15 });
      });
      CLUSTERS.forEach((c, k) => {
        const at = t.sproutStart(c);
        if (at < 0 || sprouts.has(c)) return;
        sprouts.add(c);
        sfx.sprout(k, { delay: lead(at) });
      });
      if (t.lightsAt >= 0 && !lights) { lights = true; sfx.lightsOn(nightRef.current, { delay: lead(t.lightsAt) }); }
    };
    const id = window.setInterval(poll, 16);
    const unsub = useAssembly.subscribe((s, p) => { if (s.assembled && p.running) sfx.done(); });
    return () => { clearInterval(id); unsub(); };
  }, []);

  // spread (scene 2): a low pulse per step, climbing in pitch
  useEffect(() => useStageStore.subscribe((s, p) => {
    const a = s.city.spread, b = p.city.spread;
    if (a && a.step >= 0 && a.step !== (b?.step ?? -1) && a.step > (b?.step ?? -1)) sfx.spreadPulse(a.step, a.order.length);
  }), []);

  // incident (scene 4): one cue per new attempt, by outcome. The first list seen after entering the scene is history, not news.
  useEffect(() => {
    const seen = new Set<string>();
    let primed = false;
    return useStageStore.subscribe((s, p) => {
      if (sceneRef.current !== "incident") { seen.clear(); primed = false; return; }
      const list = s.city.attempts;
      if (!list || list === p.city.attempts) return;
      const fresh = newAttempts(list, seen);
      if (!primed) { primed = true; return; }
      fresh.forEach((a, i) => setTimeout(() => PLAY[attemptCue(a)](), i * 140));
    });
  }, []);
}
