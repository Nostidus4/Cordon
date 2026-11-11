import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { AdditiveBlending, Color, MathUtils, Object3D, type InstancedMesh, type Mesh, type MeshBasicMaterial } from "three";
import { nowS, POP_ORDER, resetAssembly, startAssembly, tickAssembly, timeline } from "./assembly";
import { BUILDING_BY_CODE } from "./buildings";
import { env } from "./env";
import { requestShadowUpdate } from "./FrameGovernor";
import { noRaycast } from "./fx";
import { getPlacement, ISLAND } from "./layout";
import { LEVELS, prefersReducedMotion, useQuality } from "./quality";

const PUFFS = 8;
const SPARKS = 5;
const PUFF_LIFE = 0.8;
const LAND = 0.2; // seconds after the pop starts when the building "lands" (puff + sparkles fire)

/** Runs the assembly timeline for the current set of expected assets and draws the landing puffs / sparkles / island ripples. */
export default function Assembly({ expected }: { expected: string[] }) {
  const key = expected.join(",");
  const low = useQuality((s) => LEVELS[s.level].tier === "low");
  const reduced = useMemo(prefersReducedMotion, []);
  useLayoutEffect(() => {
    startAssembly({ expected, reduced, night: () => env.night });
    return resetAssembly;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);
  useFrame(() => {
    if (tickAssembly(nowS())) requestShadowUpdate(); // buildings move while assembling: keep the (static) shadow map fresh
  }, -3);
  return reduced || low ? null : <AssemblyFx />;
}

const rng = (seed: number) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};

function AssemblyFx() {
  const puffs = useRef<InstancedMesh>(null);
  const sparks = useRef<InstancedMesh>(null);
  const ripple = useRef<(Mesh | null)[]>([]);
  const rippleMat = useRef<(MeshBasicMaterial | null)[]>([]);
  const o = useMemo(() => new Object3D(), []);
  const seeds = useMemo(() => {
    const r = rng(7);
    return POP_ORDER.map(() => ({
      a0: r() * 6.28,
      sp: Array.from({ length: SPARKS }, () => ({ a: r() * 6.28, rad: 0.3 + r() * 0.5, v: 7 + r() * 7, ph: r() * 6.28, s: 0.5 + r() * 0.5 })),
    }));
  }, []);
  const sparkColor = useMemo(() => new Color("#ffe9a0").multiplyScalar(2), []);

  useFrame(() => {
    const tl = timeline;
    const P = puffs.current;
    const S = sparks.current;
    if (!tl || !P || !S) return;
    const now = nowS();
    let any = false;
    POP_ORDER.forEach((code, bi) => {
      const start = tl.popStart(code);
      const e = start < 0 ? -1 : now - start - LAND;
      const active = e >= 0 && e < PUFF_LIFE;
      const [px, , pz] = getPlacement(code).position;
      const rr = Math.hypot(...BUILDING_BY_CODE[code].dims.slice(0, 2)) / 2;
      const u = active ? e / PUFF_LIFE : 1;
      if (active) any = true;
      for (let i = 0; i < PUFFS; i++) {
        const a = seeds[bi].a0 + (i / PUFFS) * Math.PI * 2;
        const r = rr * 0.75 + u * 7;
        o.position.set(px + Math.cos(a) * r, 0.9 + u * 2.2, pz + Math.sin(a) * r);
        o.scale.setScalar(active ? (1 - u) * (1.4 + u * 2.4) : 0.0001);
        o.updateMatrix();
        P.setMatrixAt(bi * PUFFS + i, o.matrix);
      }
      for (let i = 0; i < SPARKS; i++) {
        const sp = seeds[bi].sp[i];
        o.position.set(px + Math.cos(sp.a) * rr * sp.rad, 2 + u * sp.v, pz + Math.sin(sp.a) * rr * sp.rad);
        o.rotation.set(0, u * 6 + sp.ph, 0);
        o.scale.setScalar(active ? (1 - u) * sp.s * (0.7 + 0.3 * Math.sin(u * 30 + sp.ph)) * 0.9 : 0.0001);
        o.updateMatrix();
        S.setMatrixAt(bi * SPARKS + i, o.matrix);
      }
      o.rotation.set(0, 0, 0);
    });
    P.visible = S.visible = any;
    if (any) {
      P.instanceMatrix.needsUpdate = true;
      S.instanceMatrix.needsUpdate = true;
    }
    // island ripples: two rings spreading across the sea from the shore
    for (let i = 0; i < 2; i++) {
      const m = ripple.current[i];
      const mat = rippleMat.current[i];
      if (!m || !mat) continue;
      const e = tl.baseAt < 0 ? -1 : now - tl.baseAt - 0.15 - i * 0.35;
      const u = e / 1.5;
      m.visible = u >= 0 && u < 1;
      if (m.visible) {
        const s = MathUtils.lerp(0.62, 1.25, 1 - Math.pow(1 - u, 2));
        m.scale.set(s * 1.1, s, 1);
        mat.opacity = 0.55 * (1 - u) * Math.min(1, u * 6);
      }
    }
  });

  const cx = (ISLAND.minX + ISLAND.maxX) / 2;
  const cz = (ISLAND.minZ + ISLAND.maxZ) / 2;
  return (
    <>
      <instancedMesh ref={puffs} args={[undefined, undefined, POP_ORDER.length * PUFFS]} frustumCulled={false} raycast={noRaycast} visible={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshBasicMaterial color="#fff3de" transparent opacity={0.6} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={sparks} args={[undefined, undefined, POP_ORDER.length * SPARKS]} frustumCulled={false} raycast={noRaycast} visible={false}>
        <octahedronGeometry args={[0.55, 0]} />
        <meshBasicMaterial color={sparkColor} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </instancedMesh>
      {[0, 1].map((i) => (
        <mesh key={i} ref={(m) => { ripple.current[i] = m; }} position={[cx, -3.2, cz]} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={noRaycast}>
          <ringGeometry args={[ (ISLAND.maxX - ISLAND.minX) / 2, (ISLAND.maxX - ISLAND.minX) / 2 + 1.6, 96]} />
          <meshBasicMaterial ref={(m) => { rippleMat.current[i] = m; }} color="#cfeaff" transparent opacity={0} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}
