import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MathUtils } from "three";
import { useCityStore } from "./cityStore";
import { env } from "./env";

/** Damps env.night toward the selected mode (~2 s transition) and runs the optional 60 s day/night cycle. */
export default function EnvDriver() {
  const acc = useRef(0);
  useEffect(() => {
    env.night = useCityStore.getState().mode === "night" ? 1 : 0;
  }, []);
  useFrame((_, dt) => {
    const s = useCityStore.getState();
    if (s.autoCycle) {
      acc.current += dt;
      if (acc.current > 30) {
        acc.current = 0;
        s.setMode(s.mode === "night" ? "day" : "night");
      }
    } else acc.current = 0;
    env.night = MathUtils.damp(env.night, s.mode === "night" ? 1 : 0, 2.2, dt);
  });
  return null;
}
