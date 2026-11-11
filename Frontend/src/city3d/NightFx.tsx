import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, CanvasTexture, Color, Object3D, type InstancedMesh, type MeshBasicMaterial } from "three";
import { lifeAt, litAt, POP_ORDER } from "./assembly";
import { env } from "./env";
import { LEVELS, useQuality } from "./quality";
import { noRaycast } from "./fx";
import { ISLAND } from "./layout";

let poolTex: CanvasTexture | null = null;
function pool() {
  if (poolTex) return poolTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,214,140,0.95)");
  gr.addColorStop(0.35, "rgba(255,190,100,0.35)");
  gr.addColorStop(1, "rgba(255,170,80,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  poolTex = new CanvasTexture(c);
  return poolTex;
}

/** Fake light pools on the ground under street lamps: additive decals (no real lights). */
export function LampPools({ spots }: { spots: [number, number][] }) {
  const ref = useRef<InstancedMesh>(null);
  const mat = useRef<MeshBasicMaterial>(null);
  useLayoutEffect(() => {
    const o = new Object3D();
    spots.forEach(([x, z], i) => {
      o.position.set(x, 0.4, z);
      o.rotation.set(-Math.PI / 2, 0, 0);
      o.scale.setScalar(1);
      o.updateMatrix();
      ref.current?.setMatrixAt(i, o.matrix);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [spots]);
  useFrame(() => {
    const k = env.night * litAt(POP_ORDER.length);
    if (mat.current) mat.current.opacity = Math.min(k, 1) * 0.6;
    if (ref.current) ref.current.visible = k > 0.02;
  });
  if (!spots.length) return null;
  return (
    <instancedMesh key={spots.length} ref={ref} args={[undefined, undefined, spots.length]} frustumCulled={false} raycast={noRaycast}>
      <planeGeometry args={[8, 8]} />
      <meshBasicMaterial ref={mat} map={pool()} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} opacity={0} />
    </instancedMesh>
  );
}

/** Soft drifting fireflies above parks; fade in with night. */
export function Fireflies({ count = 70 }: { count?: number }) {
  const low = useQuality((s) => LEVELS[s.level].tier === "low");
  return low ? null : <FirefliesImpl count={count} />;
}

function FirefliesImpl({ count }: { count: number }) {
  const ref = useRef<InstancedMesh>(null);
  const o = useMemo(() => new Object3D(), []);
  const seeds = useMemo(() => {
    let s = 99;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: count }, () => ({
      x: ISLAND.minX + r() * (ISLAND.maxX - ISLAND.minX),
      z: ISLAND.minZ + r() * (ISLAND.maxZ - ISLAND.minZ),
      y: 1.5 + r() * 7,
      p: r() * 6.28,
      sp: 0.3 + r() * 0.6,
    }));
  }, [count]);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const t = clock.elapsedTime;
    const vis = env.night * lifeAt();
    m.visible = vis > 0.03; // by day: no per-frame matrix work at all
    if (!m.visible) return;
    seeds.forEach((s, i) => {
      o.position.set(s.x + Math.sin(t * s.sp + s.p) * 3, s.y + Math.sin(t * s.sp * 1.7 + s.p) * 1.2, s.z + Math.cos(t * s.sp * 0.8 + s.p) * 3);
      o.scale.setScalar(vis * (0.5 + 0.5 * Math.sin(t * 2 * s.sp + s.p * 3)) + 0.0001);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false} raycast={noRaycast}>
      <sphereGeometry args={[0.22, 6, 5]} />
      <meshBasicMaterial color={new Color("#d8ff7a").multiplyScalar(2.2)} toneMapped={false} />
    </instancedMesh>
  );
}
