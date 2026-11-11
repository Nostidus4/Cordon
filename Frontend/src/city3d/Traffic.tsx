import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { MathUtils, type Group, type MeshStandardMaterial } from "three";
import { env } from "./env";
import { noRaycast } from "./fx";

interface Lane { a: [number, number]; b: [number, number]; dir: 1 | -1; color: string; speed: number }
// 6 cars on 6 different street stretches (right-hand lanes). They never share a lane, never enter the plaza roundabout or a building plot.
const LANES: Lane[] = [
  { a: [-21, -44], b: [-21, 50], dir: 1, color: "#ef5350", speed: 4.4 },
  { a: [21, -44], b: [21, 50], dir: -1, color: "#ffca28", speed: 3.8 },
  { a: [-60, -9.5], b: [-26, -9.5], dir: 1, color: "#42a5f5", speed: 4.0 },
  { a: [26, 17.5], b: [60, 17.5], dir: 1, color: "#ffffff", speed: 3.6 },
  { a: [-60, 17.5], b: [-26, 17.5], dir: -1, color: "#ab47bc", speed: 4.2 },
  { a: [0, 22], b: [0, 54], dir: 1, color: "#ff8a3d", speed: 3.4 },
];

function Car({ color, lights }: { color: string; lights: React.MutableRefObject<MeshStandardMaterial[]> }) {
  const reg = (m: MeshStandardMaterial | null) => void (m && !lights.current.includes(m) && lights.current.push(m));
  return (
    <group>
      {/* body + cabin (front = +Z) */}
      <RoundedBox args={[2, 0.9, 4.2]} radius={0.35} smoothness={3} position={[0, 0.95, 0]} castShadow raycast={noRaycast}>
        <meshStandardMaterial color={color} roughness={0.45} />
      </RoundedBox>
      <RoundedBox args={[1.7, 0.8, 2.2]} radius={0.32} smoothness={3} position={[0, 1.65, -0.2]} castShadow raycast={noRaycast}>
        <meshStandardMaterial color="#dff1ff" roughness={0.25} />
      </RoundedBox>
      <RoundedBox args={[1.76, 0.18, 2.3]} radius={0.08} smoothness={2} position={[0, 2.08, -0.2]} raycast={noRaycast}>
        <meshStandardMaterial color={color} roughness={0.45} />
      </RoundedBox>
      {/* wheels */}
      {[[-1.02, 1.3], [1.02, 1.3], [-1.02, -1.3], [1.02, -1.3]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.45, z]} rotation={[0, 0, Math.PI / 2]} castShadow raycast={noRaycast}>
          <cylinderGeometry args={[0.46, 0.46, 0.34, 14]} />
          <meshStandardMaterial color="#26263a" roughness={0.8} />
        </mesh>
      ))}
      {/* head + tail lights */}
      {[-0.6, 0.6].map((x) => (
        <mesh key={`h${x}`} position={[x, 1.05, 2.12]} raycast={noRaycast}>
          <boxGeometry args={[0.42, 0.28, 0.1]} />
          <meshStandardMaterial ref={reg} color="#fff6cf" emissive="#fff0a8" emissiveIntensity={0.4} toneMapped={false} />
        </mesh>
      ))}
      {[-0.6, 0.6].map((x) => (
        <mesh key={`t${x}`} position={[x, 1.05, -2.12]} raycast={noRaycast}>
          <boxGeometry args={[0.42, 0.24, 0.1]} />
          <meshStandardMaterial color="#ff4a4a" emissive="#ff2d3d" emissiveIntensity={0.3} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

/** Six cartoon cars looping on fixed street lanes. Lights glow at night. */
export default function Traffic() {
  const refs = useRef<(Group | null)[]>([]);
  const u = useRef(LANES.map((_, i) => (i * 0.31) % 1));
  const lights = useRef<MeshStandardMaterial[]>([]);
  const lane = useMemo(() => LANES, []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    lane.forEach((l, i) => {
      const g = refs.current[i];
      if (!g) return;
      const dx = l.b[0] - l.a[0];
      const dz = l.b[1] - l.a[1];
      const len = Math.hypot(dx, dz);
      u.current[i] = (u.current[i] + (l.speed * Math.min(dt, 0.05)) / len) % 1;
      const uu = l.dir === 1 ? u.current[i] : 1 - u.current[i];
      const hx = (dx / len) * l.dir;
      const hz = (dz / len) * l.dir;
      const off = 1.6; // right-hand lane
      g.position.set(l.a[0] + dx * uu - hz * off, 0.12 + Math.sin(t * 6 + i) * 0.025, l.a[1] + dz * uu + hx * off);
      g.rotation.y = Math.atan2(hx, hz);
      const edge = Math.min(u.current[i], 1 - u.current[i]) * len;
      g.scale.setScalar(MathUtils.clamp(edge / 3, 0.0001, 1));
    });
    for (const m of lights.current) m.emissiveIntensity = 0.4 + env.night * 3;
  });

  return (
    <group>
      {lane.map((l, i) => (
        <group key={i} ref={(g) => { refs.current[i] = g; }}>
          <Car color={l.color} lights={lights} />
        </group>
      ))}
    </group>
  );
}
