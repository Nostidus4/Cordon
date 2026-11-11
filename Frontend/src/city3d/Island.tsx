import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { env } from "./env";
import { RoundedBox } from "@react-three/drei";
import { Color, ExtrudeGeometry, Object3D, Shape, ShapeGeometry, type InstancedMesh } from "three";
import { BUILDINGS } from "./buildings";
import { noRaycast } from "./fx";
import { ASSEMBLY, GATE, ISLAND, PLAZA_RING, ROADS, ROAD_W, getPlacement } from "./layout";

function roundedRect(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new Shape();
  const x = cx - w / 2;
  const y = cy - h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const W = ISLAND.maxX - ISLAND.minX;
const D = ISLAND.maxZ - ISLAND.minZ;
const CZ = (ISLAND.maxZ + ISLAND.minZ) / 2;

// deterministic pseudo-random
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

function treeSpots(): [number, number, number][] {
  const r = rng(7);
  const out: [number, number, number][] = [];
  for (const b of BUILDINGS) {
    if (b.round) continue;
    const [x, , z] = getPlacement(b.code).position;
    const [w, d] = b.dims;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push([x + sx * (w / 2 + 0.6), z + sz * (d / 2 + 0.6), 0.8 + r() * 0.5]);
  }
  const rim = (x: number, z: number) => {
    // keep clear of roads, gate, assembly pad and the plaza
    if (Math.abs(x) < 7 && z > -30) return;
    if (Math.abs(z + 9.5) < 4 || Math.abs(z - 17.5) < 4) return;
    if (Math.abs(Math.abs(x) - 21) < 4.5) return;
    if (x < -44 && z > 38) return;
    out.push([x + (r() - 0.5) * 2, z + (r() - 0.5) * 2, 0.9 + r() * 0.6]);
  };
  for (let x = -60; x <= 60; x += 7.5) {
    rim(x, -48.5);
    rim(x, 60);
  }
  for (let z = -42; z <= 56; z += 8) {
    rim(-62, z);
    rim(62, z);
  }
  return out;
}

function lampSpots(): [number, number][] {
  const out: [number, number][] = [];
  for (let z = 24; z <= 52; z += 9) out.push([-5.2, z], [5.2, z]);
  for (let a = 0; a < 6; a++) out.push([Math.cos((a * Math.PI) / 3 + 0.5) * 16.5, Math.sin((a * Math.PI) / 3 + 0.5) * 16.5]);
  out.push([-24, -9.5 + 3.6], [24, -9.5 + 3.6], [-24, 17.5 + 3.6], [24, 17.5 + 3.6]);
  return out;
}

export const LAMP_SPOTS = lampSpots();

function Scenery() {
  const trunk = useRef<InstancedMesh>(null);
  const leaf = useRef<InstancedMesh>(null);
  const spots = useMemo(treeSpots, []);
  const phases = useMemo(() => spots.map((_, i) => i * 1.7), [spots]);
  const dummy = useMemo(() => new Object3D(), []);
  const lampPost = useRef<InstancedMesh>(null);
  const lampBulb = useRef<InstancedMesh>(null);
  const bulbMat = useRef<import("three").MeshStandardMaterial>(null);
  const lamps = useMemo(lampSpots, []);

  useLayoutEffect(() => {
    const cols = ["#4fae5a", "#3f9d55", "#68bd5c", "#2f8f5a"].map((c) => new Color(c));
    spots.forEach((_, i) => leaf.current?.setColorAt(i, cols[i % cols.length]));
    if (leaf.current?.instanceColor) leaf.current.instanceColor.needsUpdate = true;
    lamps.forEach(([x, z], i) => {
      dummy.position.set(x, 2.2, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      lampPost.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x, 4.6, z);
      dummy.updateMatrix();
      lampBulb.current?.setMatrixAt(i, dummy.matrix);
    });
    for (const m of [lampPost.current, lampBulb.current]) if (m) m.instanceMatrix.needsUpdate = true;
  }, [spots, lamps, dummy]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (bulbMat.current) bulbMat.current.emissiveIntensity = 0.6 + env.night * 3.2;
    spots.forEach(([x, z, s], i) => {
      const sway = Math.sin(t * 1.3 + phases[i]) * 0.05;
      dummy.position.set(x, 1.1 * s, z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(s * 0.8, s, s * 0.8);
      dummy.updateMatrix();
      trunk.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(x + sway * 3.2 * s, 3.9 * s, z);
      dummy.rotation.set(0, phases[i], sway);
      dummy.scale.setScalar(s * (1 + Math.sin(t * 1.7 + phases[i]) * 0.025));
      dummy.updateMatrix();
      leaf.current?.setMatrixAt(i, dummy.matrix);
    });
    if (trunk.current) trunk.current.instanceMatrix.needsUpdate = true;
    if (leaf.current) leaf.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={trunk} args={[undefined, undefined, spots.length]} castShadow raycast={noRaycast}>
        <cylinderGeometry args={[0.35, 0.5, 2.2, 6]} />
        <meshStandardMaterial color="#7a4e2d" roughness={0.9} />
      </instancedMesh>
      <instancedMesh ref={leaf} args={[undefined, undefined, spots.length]} castShadow raycast={noRaycast}>
        <icosahedronGeometry args={[2.1, 0]} />
        <meshStandardMaterial color="#ffffff" roughness={0.75} flatShading />
      </instancedMesh>
      <instancedMesh ref={lampPost} args={[undefined, undefined, lamps.length]} raycast={noRaycast}>
        <cylinderGeometry args={[0.14, 0.18, 4.4, 6]} />
        <meshStandardMaterial color="#2c2a50" />
      </instancedMesh>
      <instancedMesh ref={lampBulb} args={[undefined, undefined, lamps.length]} raycast={noRaycast}>
        <sphereGeometry args={[0.5, 10, 8]} />
        <meshStandardMaterial ref={bulbMat} color="#ffd27a" emissive="#ffb347" emissiveIntensity={2.4} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

function Dashes() {
  const ref = useRef<InstancedMesh>(null);
  const items = useMemo(() => {
    const out: { x: number; z: number; ry: number }[] = [];
    for (const r of ROADS) {
      const dx = r.b[0] - r.a[0];
      const dz = r.b[1] - r.a[1];
      const len = Math.hypot(dx, dz);
      const n = Math.floor(len / 5);
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        out.push({ x: r.a[0] + dx * u, z: r.a[1] + dz * u, ry: Math.atan2(-dz, dx) });
      }
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const o = new Object3D();
    items.forEach((it, i) => {
      o.position.set(it.x, 0.11, it.z);
      o.rotation.set(0, it.ry, 0);
      o.updateMatrix();
      ref.current?.setMatrixAt(i, o.matrix);
    });
    if (ref.current) ref.current.instanceMatrix.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} raycast={noRaycast}>
      <boxGeometry args={[2.2, 0.04, 0.22]} />
      <meshStandardMaterial color="#e8e4ff" roughness={0.8} />
    </instancedMesh>
  );
}

/** Procedural island used when there is no base glb: raised rounded square, street grid, lawns, gate, assembly area. */
export default function Island() {
  const body = useMemo(() => {
    const g = new ExtrudeGeometry(roundedRect(W, D, 9, 0, -CZ), { depth: 4, bevelEnabled: false });
    return g;
  }, []);
  const top = useMemo(() => new ShapeGeometry(roundedRect(W - 3.5, D - 3.5, 7, 0, -CZ)), []);
  const lots = BUILDINGS.filter((b) => !b.round);
  const [gx, gz] = GATE;

  return (
    <group>
      <mesh geometry={body} rotation={[-Math.PI / 2, 0, 0]} position={[0, -4, 0]} receiveShadow castShadow>
        <meshStandardMaterial color="#6967bd" roughness={0.85} />
      </mesh>
      <mesh geometry={top} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <meshStandardMaterial color="#c2bfee" roughness={0.9} />
      </mesh>

      {ROADS.map((r, i) => {
        const dx = r.b[0] - r.a[0];
        const dz = r.b[1] - r.a[1];
        const len = Math.hypot(dx, dz);
        const onBridge = r.b[1] > ISLAND.maxZ;
        const L = onBridge ? ISLAND.maxZ - r.a[1] : len;
        return (
          <mesh key={i} position={[(r.a[0] + r.b[0]) / 2 - (onBridge ? 0 : 0), 0.07, onBridge ? r.a[1] + L / 2 : (r.a[1] + r.b[1]) / 2]} rotation={[0, Math.atan2(-dz, dx), 0]} receiveShadow>
            <boxGeometry args={[onBridge ? ROAD_W : len, 0.1, ROAD_W]} />
            <meshStandardMaterial color="#5d5c92" roughness={0.85} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[PLAZA_RING.inner, PLAZA_RING.outer, 48]} />
        <meshStandardMaterial color="#5d5c92" roughness={0.85} />
      </mesh>
      <Dashes />

      {/* lawn pads under each building */}
      {lots.map((b) => {
        const [x, , z] = getPlacement(b.code).position;
        const [w, d] = b.dims;
        return (
          <group key={b.code} position={[x, 0, z]}>
            <RoundedBox args={[w + 5.4, 0.28, d + 5.4]} radius={0.12} position={[0, 0.14, 0]} receiveShadow>
              <meshStandardMaterial color="#e0dcfb" roughness={0.8} />
            </RoundedBox>
            <RoundedBox args={[w + 4, 0.34, d + 4]} radius={0.12} position={[0, 0.17, 0]} receiveShadow>
              <meshStandardMaterial color="#62b85c" roughness={0.9} />
            </RoundedBox>
          </group>
        );
      })}

      {/* gate arch + bridge */}
      <group position={[gx, 0, gz]}>
        {[-1, 1].map((s) => (
          <group key={s} position={[s * 11, 0, 0]}>
            <RoundedBox args={[5, 15, 5]} radius={0.5} position={[0, 7.5, 0]} castShadow>
              <meshStandardMaterial color="#d9d5f7" roughness={0.6} />
            </RoundedBox>
            <mesh position={[0, 8, 2.6]}>
              <planeGeometry args={[3, 9]} />
              <meshStandardMaterial color="#2a58e8" emissive="#2a58e8" emissiveIntensity={0.35} />
            </mesh>
            <mesh position={[0, 1.2, 2.6]}>
              <planeGeometry args={[1.6, 2.4]} />
              <meshStandardMaterial color="#ffd27a" emissive="#ffb347" emissiveIntensity={1.6} toneMapped={false} />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 10, 0]} castShadow>
          <torusGeometry args={[9.5, 2, 8, 28, Math.PI]} />
          <meshStandardMaterial color="#e3e0fb" roughness={0.6} />
        </mesh>
        <mesh position={[0, 16.5, 1.6]}>
          <octahedronGeometry args={[1.6, 0]} />
          <meshStandardMaterial color="#1565e8" emissive="#00e5ff" emissiveIntensity={1.8} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.05, 14]} receiveShadow>
          <boxGeometry args={[11, 0.7, 26]} />
          <meshStandardMaterial color="#cfcaf5" roughness={0.8} />
        </mesh>
      </group>

      {/* evacuation assembly area "Điểm tập kết" */}
      <group position={[ASSEMBLY[0], 0, ASSEMBLY[1]]}>
        <RoundedBox args={[17, 0.34, 13]} radius={0.12} position={[0, 0.17, 0]} receiveShadow>
          <meshStandardMaterial color="#6cc864" roughness={0.9} />
        </RoundedBox>
        {[
          [0, 6.2, 16, 0.25],
          [0, -6.2, 16, 0.25],
          [7.8, 0, 0.25, 12],
          [-7.8, 0, 0.25, 12],
        ].map(([x, z, sx, sz], i) => (
          <mesh key={i} position={[x, 0.37, z]}>
            <boxGeometry args={[sx, 0.06, sz]} />
            <meshStandardMaterial color="#ffffff" />
          </mesh>
        ))}
        <group position={[-5, 0, -5.4]} rotation={[0, 0.2, 0]}>
          <mesh position={[0, 3.2, 0]} castShadow>
            <boxGeometry args={[6.4, 2.6, 0.3]} />
            <meshStandardMaterial color="#1f9d55" emissive="#1f9d55" emissiveIntensity={0.3} />
          </mesh>
          <mesh position={[-2.6, 1.0, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 2, 6]} />
            <meshStandardMaterial color="#555" />
          </mesh>
          <mesh position={[2.6, 1.0, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 2, 6]} />
            <meshStandardMaterial color="#555" />
          </mesh>
        </group>
      </group>

      <Scenery />
    </group>
  );
}
