import { useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, MathUtils } from "three";
import { makeRim, type RimUniforms } from "./rim";
import { GLOW, STATE_COLOR, type BuildingState } from "./buildings";
import { useCityStore } from "./cityStore";

/** Mutable per-building animation values, updated every frame (no React re-renders). */
export interface Anim {
  state: BuildingState;
  color: Color; // damped glow color (building glow when normal, state color otherwise)
  glow: number; // emissive intensity multiplier (pulsing per state)
  hover: number; // 0..1 damped hover/selected amount
  bounce: number; // squash-stretch signal, -1..1
  fill: number; // 0..1 recovery progress
  rim: RimUniforms; // silhouette glow uniforms shared by all materials of this building
  t: number; // clock seconds
  since: number; // clock time at last state change
}

const STATE_TARGET: Record<BuildingState, Color> = {
  normal: new Color(STATE_COLOR.normal),
  warning: new Color(STATE_COLOR.warning),
  incident: new Color(STATE_COLOR.incident),
  recovery: new Color(STATE_COLOR.recovery),
};

const RIM_HOVER = new Color("#9fe8ff");
const RIM_STATE: Record<BuildingState, Color> = {
  normal: RIM_HOVER,
  warning: new Color("#ffb300"),
  incident: new Color("#ff2d3d"),
  recovery: new Color("#58c8d8"),
};

export function pulseFor(state: BuildingState, t: number): number {
  switch (state) {
    case "warning":
      return 1.5 + 0.6 * Math.sin(t * 3.2);
    case "incident":
      return 1.9 + 1.0 * Math.sin(t * 8);
    case "recovery":
      return 1.2 + 0.2 * Math.sin(t * 1.5);
    default:
      return 1.0;
  }
}

export function useBuildingAnim(code: string): MutableRefObject<Anim> {
  const glowColor = useRef(new Color(GLOW[code]));
  const ref = useRef<Anim>({
    state: useCityStore.getState().states[code],
    color: glowColor.current.clone(),
    glow: 1,
    hover: 0,
    bounce: 0,
    fill: 0,
    rim: makeRim(),
    t: 0,
    since: 0,
  });
  const mix = useRef(new Color());
  const hoverT = useRef(10);
  const wasHover = useRef(false);
  useFrame(({ clock }, dt) => {
    const a = ref.current;
    const s = useCityStore.getState();
    const st = s.states[code];
    const t = clock.elapsedTime;
    if (st !== a.state) {
      a.state = st;
      a.since = t;
    }
    a.t = t;
    a.color.lerp(st === "normal" ? glowColor.current : mix.current.copy(glowColor.current).lerp(STATE_TARGET[st], 0.6), 1 - Math.exp(-6 * dt));
    a.glow = pulseFor(st, t);
    const on = s.hovered === code || s.selected === code;
    if (on && !wasHover.current) hoverT.current = 0;
    wasHover.current = on;
    hoverT.current += dt;
    a.bounce = Math.exp(-5 * hoverT.current) * Math.sin(16 * hoverT.current);
    a.hover = MathUtils.damp(a.hover, on ? 1 : 0, 10, dt);
    const rimTarget =
      st === "incident" ? 2.6 + 1.4 * Math.sin(t * 7) : st === "warning" ? 1.8 + 0.8 * Math.sin(t * 3.2) : st === "recovery" ? 1.5 : a.hover * 0.9;
    a.rim.uRim.value = MathUtils.damp(a.rim.uRim.value, Math.max(rimTarget, a.hover * 0.7), 8, dt);
    a.rim.uRimColor.value.lerp(st === "normal" ? RIM_HOVER : RIM_STATE[st], 1 - Math.exp(-8 * dt));
    a.fill = st === "recovery" ? MathUtils.clamp((t - a.since) / 6, 0, 1) : st === "normal" ? 1 : 0;
  });
  return ref;
}
