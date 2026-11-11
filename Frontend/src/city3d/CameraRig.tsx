import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { MathUtils, OrthographicCamera, Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { BUILDING_BY_CODE } from "./buildings";
import { useCityStore } from "./cityStore";
import { getPlacement } from "./layout";
import { shotDef } from "./stage/world";

/** True isometric from the front-left corner (REF_07): direction (-1, 1, 1). */
export const ISO_DIR = new Vector3(-1, 1, 1).normalize();
const DIST = 300;
const MAX_IN = 4.2; // max zoom-in relative to the overview framing
const CENTER = new Vector3(8, 0, -2);

function fitZoom(w: number, h: number) {
  // island iso footprint ~ (W+D)/sqrt2 wide, ~ (W+D)/2.45 tall (+ building height margin)
  return Math.min(w / 150, h / 118);
}

/** Intro zoom-in, then damped focus on selection / overview. Pan is clamped to the island; user input cancels the animation. */
export default function CameraRig() {
  const camera = useThree((s) => s.camera) as OrthographicCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const goal = useRef<{ target: Vector3; zoom: number; lambda: number } | null>(null);
  const base = fitZoom(size.width, size.height);

  const goalFor = (sel: string | null, lambda: number) => {
    const shot = useCityStore.getState().shot;
    if (shot) {
      const d = shotDef(shot);
      return { target: new Vector3(...d.target), zoom: fitZoom(size.width, size.height) * Math.min(MAX_IN, Math.max(1, d.zoom)), lambda: 2.4 };
    }
    if (!sel) return { target: CENTER.clone(), zoom: fitZoom(size.width, size.height), lambda };
    const def = BUILDING_BY_CODE[sel];
    const p = getPlacement(sel).position;
    // shift so the building sits left of the right-hand panels and below the top bar
    const target = new Vector3(p[0], def.dims[2] * 0.35, p[2]).addScaledVector(new Vector3(1, 0, 1).normalize(), 9).addScaledVector(new Vector3(1, 0, -1).normalize(), 5);
    return { target, zoom: fitZoom(size.width, size.height) * 2.2, lambda };
  };

  useEffect(() => {
    const sel = useCityStore.getState().selected;
    camera.position.copy(CENTER).addScaledVector(ISO_DIR, DIST);
    camera.zoom = base * 1.6;
    camera.updateProjectionMatrix();
    goal.current = goalFor(sel, 1.8);
    controls?.target.copy(CENTER);
    return useCityStore.subscribe((s, prev) => {
      if (s.selected !== prev.selected || s.shot !== prev.shot) goal.current = goalFor(s.selected, 3.4);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => (goal.current = null);
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame((_, dt) => {
    if (!controls) return;
    if (import.meta.env.DEV) (window as unknown as { __cam?: unknown }).__cam = { camera, controls };
    const g = goal.current;
    if (g) {
      const l = g.lambda;
      for (const k of ["x", "y", "z"] as const) controls.target[k] = MathUtils.damp(controls.target[k], g.target[k], l, dt);
      camera.zoom = MathUtils.damp(camera.zoom, g.zoom, l, dt);
      if (controls.target.distanceTo(g.target) < 0.05 && Math.abs(camera.zoom - g.zoom) < 0.02) goal.current = null;
    }
    // zoom limits (ortho: only zoom matters, distance limits do nothing): out = overview framing, in = ~one building
    controls.minZoom = base;
    controls.maxZoom = base * MAX_IN;
    camera.zoom = MathUtils.clamp(camera.zoom, base, base * MAX_IN);
    // pan: the island centre can never leave the view (radius grows with zoom-in)
    const zr = camera.zoom / base;
    const R = 8 + 150 * MathUtils.clamp((zr - 1) / 0.6, 0, 1);
    const c0 = CENTER;
    const dx = controls.target.x - c0.x;
    const dz = controls.target.z - c0.z;
    const dd = Math.hypot(dx, dz);
    if (dd > R) {
      controls.target.x = c0.x + (dx / dd) * R;
      controls.target.z = c0.z + (dz / dd) * R;
    }
    // clamp pan to island
    const t = controls.target;
    t.y = MathUtils.clamp(t.y, 0, 20);
    camera.updateProjectionMatrix();
    controls.update();
    // card scale follows zoom (kept readable)
    const k = MathUtils.clamp(0.72 + 0.2 * (camera.zoom / Math.max(base, 1)), 0.72, 1.1);
    document.documentElement.style.setProperty("--card-scale", k.toFixed(3));
    document.documentElement.style.setProperty("--label-vis", camera.zoom / Math.max(base, 1) >= 0.75 ? "1" : "0");
  });
  return null;
}
