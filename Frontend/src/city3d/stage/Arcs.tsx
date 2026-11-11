import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { Color, Vector3 } from "three";
import { useRT } from "./context";
import { TONE_COLOR } from "./world";
import type { ArcDef } from "./runtime";

const N = 26;
const GREEN = new Color();

/** Dashed (declared) / dotted (inferred) / red (reached) glowing arc between two world nodes, re-laid out every frame. */
export function Arc({ def }: { def: ArcDef }) {
  const rt = useRT();
  const line = useRef<{ geometry: { setPositions: (a: number[]) => void }; computeLineDistances: () => void; material: { color: Color; dashOffset: number; opacity: number; linewidth: number; dashed: boolean; dashSize: number; gapSize: number } } | null>(null);
  const A = useMemo(() => new Vector3(), []);
  const B = useMemo(() => new Vector3(), []);
  const buf = useMemo(() => new Array<number>(N * 3).fill(0), []);
  const init = useMemo<[number, number, number][]>(() => [[0, 0, 0], [0, 1, 0]], []);

  useFrame(({ clock }, dt) => {
    const l = line.current;
    if (!l) return;
    rt.nodePos(def.a, A);
    rt.nodePos(def.b, B);
    const dist = A.distanceTo(B);
    const lift = 3 + dist * 0.22;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      buf[i * 3] = A.x + (B.x - A.x) * u;
      buf[i * 3 + 1] = A.y + (B.y - A.y) * u + Math.sin(u * Math.PI) * lift;
      buf[i * 3 + 2] = A.z + (B.z - A.z) * u;
    }
    l.geometry.setPositions(buf);
    l.computeLineDistances();
    const a = rt.amt(def.id);
    const red = Math.max(a.red, 0);
    const col = GREEN.set(def.style === "declared" ? "#c4b5fd" : def.style === "inferred" ? "#7dd3fc" : "#ffffff");
    if (a.hl > 0.05) col.lerp(new Color(TONE_COLOR[a.tone]), a.hl);
    col.lerp(new Color("#ff2d3d"), red);
    l.material.color.copy(col).multiplyScalar(1.8);
    l.material.dashOffset -= dt * (red > 0.5 ? 6 : 1.6);
    l.material.opacity = 0.55 + 0.45 * Math.max(red, a.hl) + 0.1 * Math.sin(clock.elapsedTime * 3);
    l.material.linewidth = 2.2 + red * 1.6;
  });

  return (
    <Line
      ref={line as never}
      points={init}
      color="#ffffff"
      lineWidth={2.4}
      dashed
      dashSize={def.style === "inferred" ? 0.35 : 1.1}
      gapSize={def.style === "inferred" ? 0.7 : 0.8}
      transparent
      toneMapped={false}
      raycast={() => null}
    />
  );
}
