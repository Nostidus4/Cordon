import { Color, MathUtils } from "three";

/** Shared day/night blend, 0 = day, 1 = night. Written by <EnvDriver/> every frame, read by anything animated. */
export const env = { night: 1 };

export const mixColor = (out: Color, day: string, night: string, k: number, tmp = new Color()) =>
  out.set(day).lerp(tmp.set(night), k);

export const smooth = (k: number) => MathUtils.smoothstep(k, 0, 1);
