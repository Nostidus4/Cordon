import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useAssembly } from "./assembly";
import { LEVELS, useQuality } from "./quality";

/** True when the page was opened with ?perf=1 (stats overlay + window.__perf snapshot). */
export const PERF = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("perf") === "1";

export interface PerfSnapshot {
  fps: number;
  frameMs: number;
  calls: number;
  triangles: number;
  /** min / max over the sample window: frames that refresh the shadow map draw more */
  callsMin: number;
  callsMax: number;
  trianglesMin: number;
  trianglesMax: number;
  points: number;
  lines: number;
  textures: number;
  geometries: number;
  programs: number;
  dpr: number;
  tier: string;
  assembled: boolean;
}

/** Dev stats overlay (?perf=1): fps and per-frame renderer.info totals (accumulated over every pass of the frame). */
export default function PerfStats() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = document.createElement("pre");
    el.setAttribute("data-perf", "");
    el.style.cssText =
      "position:fixed;left:8px;bottom:8px;z-index:99999;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,Menlo,monospace;color:#b6ffb0;background:rgba(0,0,0,.72);border-radius:6px;pointer-events:none;white-space:pre";
    document.body.appendChild(el);
    const w = window as unknown as { __perf?: { latest: PerfSnapshot | null; el: HTMLElement; frames: { calls: number; tris: number }[] } };
    w.__perf = { latest: null, el, frames: [] };
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
      el.remove();
      delete w.__perf;
    };
  }, [gl]);

  useFrame(() => gl.info.reset(), -1000);
  // a positive-priority subscriber turns R3F's auto render off: on the low tier (no composer) render here
  const low = useQuality((st) => LEVELS[st.level].tier === "low");
  useFrame(({ gl: g, scene, camera }) => {
    if (low) g.render(scene, camera);
  }, 1);
  let acc = 0;
  let n = 0;
  const win = { cMin: Infinity, cMax: 0, tMin: Infinity, tMax: 0 };
  let last = performance.now();
  let mark = last;
  useFrame(() => {
    const now = performance.now();
    acc += now - last;
    last = now;
    n++;
    const i = gl.info;
    const w = window as unknown as { __perf?: { latest: PerfSnapshot | null; el: HTMLElement; frames: { calls: number; tris: number }[] } };
    if (!w.__perf) return;
    w.__perf.frames.push({ calls: i.render.calls, tris: i.render.triangles });
    if (w.__perf.frames.length > 120) w.__perf.frames.shift();
    win.cMin = Math.min(win.cMin, i.render.calls);
    win.cMax = Math.max(win.cMax, i.render.calls);
    win.tMin = Math.min(win.tMin, i.render.triangles);
    win.tMax = Math.max(win.tMax, i.render.triangles);
    if (now - mark < 500) return;
    const snap: PerfSnapshot = {
      fps: Math.round((n * 1000) / acc),
      frameMs: +(acc / n).toFixed(1),
      calls: i.render.calls,
      triangles: i.render.triangles,
      callsMin: win.cMin,
      callsMax: win.cMax,
      trianglesMin: win.tMin,
      trianglesMax: win.tMax,
      points: i.render.points,
      lines: i.render.lines,
      textures: i.memory.textures,
      geometries: i.memory.geometries,
      programs: i.programs?.length ?? 0,
      dpr: gl.getPixelRatio(),
      tier: LEVELS[useQuality.getState().level].tier,
      assembled: useAssembly.getState().assembled,
    };
    w.__perf.latest = snap;
    w.__perf.el.textContent =
      `fps ${snap.fps} (${snap.frameMs} ms)  dpr ${snap.dpr}  tier ${snap.tier}\ncalls ${snap.callsMin}-${snap.callsMax}  tris ${snap.trianglesMin}-${snap.trianglesMax}\ntextures ${snap.textures}  geometries ${snap.geometries}  programs ${snap.programs}`;
    acc = 0;
    n = 0;
    mark = now;
    win.cMin = win.tMin = Infinity;
    win.cMax = win.tMax = 0;
  }, 1000);
  return null;
}
