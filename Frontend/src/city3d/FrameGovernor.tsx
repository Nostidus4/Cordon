import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ACESFilmicToneMapping, NoToneMapping } from "three";
import { effectiveDpr, LEVELS, useQuality } from "./quality";

/** Module flag: something asked for the (static) shadow map to be re-rendered on the next frame. */
let shadowDirty = true;
export const requestShadowUpdate = () => {
  shadowDirty = true;
};

/** Mutable frame budget info for animated parts. */
export const frameInfo = { idle: false };

const IDLE_MS = 10_000;
const SHADOW_EVERY = 6; // frames between shadow refreshes while nothing asks for one (~10 Hz at 60 fps)

/**
 * Owns the render loop (Canvas runs frameloop="demand"):
 *  - invalidates every animation frame while the user is active, at ~30 fps after 10 s without input; nothing while the tab is hidden;
 *  - keeps the key-light shadow map static (autoUpdate=false) and refreshes it at ~10 Hz or on request;
 *  - steps the quality level down when the measured fps stays low;
 *  - switches renderer tone mapping when the post-processing chain is off (low tier).
 */
export default function FrameGovernor() {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const level = useQuality((s) => s.level);
  const tier = LEVELS[level].tier;
  const frame = useRef(0);
  const acc = useRef({ t: 0, n: 0, bad: 0, born: performance.now() });

  useEffect(() => {
    gl.shadowMap.autoUpdate = false;
    requestShadowUpdate();
  }, [gl]);

  useEffect(() => {
    gl.setPixelRatio(effectiveDpr(level));
    gl.toneMapping = tier === "low" ? ACESFilmicToneMapping : NoToneMapping;
    gl.toneMappingExposure = 1;
    requestShadowUpdate();
  }, [gl, level, tier]);

  useEffect(() => {
    let raf = 0;
    let last = 0;
    let lastInput = performance.now();
    const bump = () => {
      lastInput = performance.now();
    };
    const evs = ["pointerdown", "pointermove", "wheel", "keydown", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      frameInfo.idle = now - lastInput > IDLE_MS;
      if (frameInfo.idle && now - last < 31) return; // ~30 fps while idle
      last = now;
      invalidate();
    };
    raf = requestAnimationFrame(loop);
    const onVis = () => {
      if (!document.hidden) {
        lastInput = performance.now();
        acc.current = { t: 0, n: 0, bad: 0, born: performance.now() };
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      evs.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [invalidate]);

  useFrame((_, dt) => {
    // static shadow map: refresh on request, otherwise ~10 Hz (buildings bounce / spin their rings)
    frame.current++;
    const every = tier === "low" ? SHADOW_EVERY * 2 : SHADOW_EVERY;
    if (shadowDirty || frame.current % every === 0) {
      gl.shadowMap.needsUpdate = true;
      shadowDirty = false;
    }
    // adaptive quality: only while the user is active (idle frames are throttled on purpose), skipping the first seconds (shader compile / parse)
    const a = acc.current;
    if (frameInfo.idle || performance.now() - a.born < 6000 || dt > 0.5) {
      a.t = 0;
      a.n = 0;
      return;
    }
    a.t += dt;
    a.n++;
    if (a.t >= 2) {
      const fps = a.n / a.t;
      a.bad = fps < 42 ? a.bad + 1 : 0;
      a.t = 0;
      a.n = 0;
      if (a.bad >= 2) {
        a.bad = 0;
        const st = useQuality.getState();
        let next = st.level + 1;
        // skip levels that would not change anything (e.g. dpr 1 device: level 0 and 1 look the same)
        while (next < LEVELS.length - 1 && effectiveDpr(next) === effectiveDpr(st.level) && LEVELS[next].tier === LEVELS[st.level].tier) next++;
        if (!st.pinned && next < LEVELS.length) {
          useQuality.setState({ level: next });
          a.born = performance.now();
        }
      }
    }
  }, -2);
  return null;
}
