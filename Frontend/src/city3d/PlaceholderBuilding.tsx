import { useMemo, useRef, type MutableRefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { Color, ExtrudeGeometry, Shape, type Group, type MeshStandardMaterial } from "three";
import type { Anim } from "./anim";
import { GLOW, type BuildingDef, type BuildingState } from "./buildings";
import { StateEffects, noRaycast, signTexture } from "./fx";
import { env } from "./env";
import { applyRim } from "./rim";

interface Props {
  def: BuildingDef;
  anim: MutableRefObject<Anim>;
  state: BuildingState;
  /** vault scenario: B03 gets a lock sign beside it */
  lockSign?: boolean;
}

function shieldGeometry() {
  const sh = new Shape();
  sh.moveTo(0, 1.4);
  sh.lineTo(1.1, 1.0);
  sh.lineTo(1.1, 0.1);
  sh.quadraticCurveTo(1.0, -0.9, 0, -1.4);
  sh.quadraticCurveTo(-1.0, -0.9, -1.1, 0.1);
  sh.lineTo(-1.1, 1.0);
  sh.closePath();
  return new ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.1, bevelSegments: 2 });
}

/** Toy-style stand-in used until the Blender .glb exists. Front = local +Z (faces the viewer). */
export default function PlaceholderBuilding({ def, anim, state, lockSign }: Props) {
  const [w, d, h] = def.dims;
  const identity = useMemo(() => new Color(def.color), [def.color]);
  const roofColor = useMemo(() => identity.clone().lerp(new Color("#ffffff"), 0.45), [identity]);
  const topColor = useMemo(() => identity.clone().lerp(new Color("#ffffff"), 0.18), [identity]);
  const shield = useMemo(shieldGeometry, []);
  const glowMats = useRef<MeshStandardMaterial[]>([]);
  const bodyMats = useRef<MeshStandardMaterial[]>([]);
  const regGlow = (m: MeshStandardMaterial | null) => void (m && !glowMats.current.includes(m) && glowMats.current.push(m));
  const regBody = (m: MeshStandardMaterial | null) => {
    if (m && !bodyMats.current.includes(m)) {
      bodyMats.current.push(m);
      applyRim(m, anim.current.rim);
    }
  };
  const winMats = useRef<MeshStandardMaterial[]>([]);
  const regWin = (m: MeshStandardMaterial | null) => void (m && !winMats.current.includes(m) && winMats.current.push(m));
  const holo = useRef<Group>(null);
  const tint = useRef(new Color());

  useFrame(() => {
    const a = anim.current;
    for (const m of glowMats.current) {
      m.emissive.copy(a.color);
      m.emissiveIntensity = a.glow * (0.9 + a.hover * 0.8) * (1 + 0.6 * env.night);
    }
    for (const m of winMats.current) m.emissiveIntensity = 0.25 + env.night * 1.9;
    const alert = 0;
    tint.current.copy(a.color).multiplyScalar(alert * (0.5 + 0.5 * Math.min(a.glow, 2.5) / 2.5) + a.hover * 0.12);
    for (const m of bodyMats.current) m.emissive.copy(tint.current);
    if (holo.current) {
      holo.current.rotation.y = a.t * 0.6;
      holo.current.position.y = h + 6 + Math.sin(a.t * 1.4) * 0.6;
    }
  });

  if (def.round) {
    const r = def.dims[0] / 2;
    return (
      <group>
        <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[r, r + 0.6, 1, 48]} />
          <meshStandardMaterial ref={regBody} color="#d4cff5" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.05, 0]}>
          <torusGeometry args={[r * 0.62, 0.9, 10, 48]} />
          <meshStandardMaterial ref={regBody} color="#8f8be0" roughness={0.6} />
        </mesh>
        <mesh position={[0, 1.2, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <circleGeometry args={[r * 0.62, 40]} />
          <meshStandardMaterial ref={regGlow} color="#0a5a8a" emissive="#00e5ff" toneMapped={false} />
        </mesh>
        <mesh position={[0, 2.2, 0]} castShadow>
          <cylinderGeometry args={[r * 0.3, r * 0.36, 2.4, 24]} />
          <meshStandardMaterial ref={regBody} color="#e5e2ff" roughness={0.5} />
        </mesh>
        <group ref={holo} position={[0, h + 6, 0]}>
          <mesh geometry={shield} position={[0, 0, -0.17]} scale={1.9} castShadow>
            <meshStandardMaterial ref={regGlow} color="#1e6be0" emissive="#00e5ff" toneMapped={false} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
            <torusGeometry args={[4.6, 0.12, 6, 48]} />
            <meshStandardMaterial ref={regGlow} color="#0a2a30" emissive="#00e5ff" toneMapped={false} />
          </mesh>
        </group>
        <StateEffects anim={anim} radius={r} height={h} state={state} w={def.dims[0]} d={def.dims[1]} />
      </group>
    );
  }

  const topH = Math.max(2.5, h * 0.25);
  const bodyH = h - topH;
  const rows = 3;
  const cols = Math.max(2, Math.round(w / 5));
  const wins: [number, number][] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) wins.push([((c + 0.5) / cols - 0.5) * (w * 0.8), 3.2 + (r * (bodyH - 5)) / rows]);

  return (
    <group>
      <RoundedBox args={[w, bodyH, d]} radius={0.7} smoothness={3} position={[0, 0.3 + bodyH / 2, 0]} castShadow receiveShadow>
        <meshStandardMaterial ref={regBody} color={identity} roughness={0.55} />
      </RoundedBox>
      <RoundedBox args={[w + 1.2, 0.9, d + 1.2]} radius={0.35} smoothness={3} position={[0, 0.3 + bodyH + 0.3, 0]} castShadow>
        <meshStandardMaterial ref={regBody} color={roofColor} roughness={0.5} />
      </RoundedBox>
      <RoundedBox args={[w * 0.66, topH, d * 0.66]} radius={0.6} smoothness={3} position={[0, 0.3 + bodyH + 0.8 + topH / 2, 0]} castShadow>
        <meshStandardMaterial ref={regBody} color={topColor} roughness={0.5} />
      </RoundedBox>
      <mesh position={[0, 0.3 + h + 1.1, 0]} raycast={noRaycast}>
        <boxGeometry args={[w * 0.66 + 0.6, 0.35, d * 0.66 + 0.6]} />
        <meshStandardMaterial ref={regGlow} color="#223" emissive="#00e5ff" toneMapped={false} />
      </mesh>
      {/* warm windows */}
      {wins.map(([x, y], i) => (
        <mesh key={i} position={[x, y, d / 2 + 0.04]} raycast={noRaycast}>
          <boxGeometry args={[1.9, 2.1, 0.12]} />
          <meshStandardMaterial ref={regWin} color="#5a3a10" emissive="#ffc35a" emissiveIntensity={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 1.9, d / 2 + 0.08]} raycast={noRaycast}>
        <boxGeometry args={[Math.min(w * 0.2, 3.4), 3.2, 0.2]} />
        <meshStandardMaterial color="#2a1a3a" />
      </mesh>
      {/* floating emblem in the building's glow color */}
      <mesh position={[0, h + 4.5, 0]} raycast={noRaycast}>
        <octahedronGeometry args={[1.1, 0]} />
        <meshStandardMaterial color={identity} emissive={GLOW[def.code]} emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      {(state === "warning" || state === "incident") && (
        <mesh position={[w * 0.28, bodyH * 0.55, d / 2 + 0.25]} raycast={noRaycast}>
          <planeGeometry args={[4.4, 4.4]} />
          <meshBasicMaterial map={signTexture(state)} transparent toneMapped={false} />
        </mesh>
      )}
      {lockSign && state === "incident" && (
        <group position={[w / 2 + 6, 5.5, d / 2 + 4]} rotation={[0, -0.35, 0]}>
          <mesh>
            <planeGeometry args={[7, 5]} />
            <meshBasicMaterial map={signTexture("lock")} transparent toneMapped={false} />
          </mesh>
        </group>
      )}
      <StateEffects anim={anim} radius={Math.hypot(w, d) / 2} height={h + 1.5} state={state} w={w} d={d} />
    </group>
  );
}
