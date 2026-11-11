import { useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { CanvasTexture, DoubleSide, MathUtils, SRGBColorSpace, type Group, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from "three";
import type { Anim } from "./anim";
import type { MutableRefObject } from "react";

export const noRaycast = () => {};

/** Scales children in/out smoothly; hidden (not rendered) when fully out. */
export function Pop({ show, children, speed = 6 }: { show: boolean; children: ReactNode; speed?: number }) {
  const g = useRef<Group>(null);
  useFrame((_, dt) => {
    const o = g.current;
    if (!o) return;
    const s = MathUtils.damp(o.scale.x, show ? 1 : 0, speed, dt);
    o.scale.setScalar(Math.max(s, 0.0001));
    o.visible = s > 0.01;
  });
  return (
    <group ref={g} scale={0.0001} visible={false}>
      {children}
    </group>
  );
}

interface FxProps {
  anim: MutableRefObject<Anim>;
  radius: number; // footprint radius
  height: number; // roof height
}

function Beacon({ anim, height }: Pick<FxProps, "anim" | "height">) {
  const mat = useRef<MeshStandardMaterial>(null);
  const beam = useRef<Group>(null);
  const beamMat = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const a = anim.current;
    if (mat.current) {
      mat.current.emissive.copy(a.color);
      mat.current.emissiveIntensity = a.glow * 1.8;
    }
    if (beam.current) beam.current.rotation.y = a.t * (a.state === "incident" ? 5 : 2.2);
    if (beamMat.current) {
      beamMat.current.color.copy(a.color).multiplyScalar(2);
      beamMat.current.opacity = 0.16 + 0.1 * Math.sin(a.t * (a.state === "incident" ? 8 : 3));
    }
  });
  return (
    <group position={[0, height + 1.4, 0]}>
      <mesh raycast={noRaycast}>
        <cylinderGeometry args={[0.9, 1.2, 0.8, 12]} />
        <meshStandardMaterial color="#1b2447" />
      </mesh>
      <mesh position={[0, 1, 0]} raycast={noRaycast}>
        <sphereGeometry args={[0.9, 16, 12]} />
        <meshStandardMaterial ref={mat} color="#111" emissive="#fbbf24" toneMapped={false} />
      </mesh>
      <group ref={beam} position={[0, 1, 0]}>
        <mesh position={[0, 0, 4.5]} rotation={[Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <coneGeometry args={[2.4, 9, 16, 1, true]} />
          <meshBasicMaterial ref={beamMat} transparent depthWrite={false} side={DoubleSide} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

function RectBarrier({ anim, w, d }: { anim: MutableRefObject<Anim>; w: number; d: number }) {
  const glowMat = useRef<MeshBasicMaterial>(null);
  const hw = w / 2 + 3.5;
  const hd = d / 2 + 3.5;
  useFrame(() => {
    const a = anim.current;
    if (glowMat.current) {
      glowMat.current.color.copy(a.color).multiplyScalar(0.8);
      glowMat.current.opacity = 0.22 + 0.14 * Math.sin(a.t * 7);
    }
  });
  const sides: [number, number, number, number][] = [
    [0, hd, hw * 2, 0],
    [0, -hd, hw * 2, 0],
    [hw, 0, hd * 2, Math.PI / 2],
    [-hw, 0, hd * 2, Math.PI / 2],
  ];
  const posts: [number, number][] = [
    [hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd], [0, hd], [0, -hd], [hw, 0], [-hw, 0],
  ];
  return (
    <group>
      <mesh position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <planeGeometry args={[hw * 2 + 6, hd * 2 + 6]} />
        <meshBasicMaterial ref={glowMat} color="#ff2d3d" transparent opacity={0.3} depthWrite={false} toneMapped={false} />
      </mesh>
      {sides.map(([x, z, len, ry], i) => (
        <group key={i} position={[x, 1.6, z]} rotation={[0, ry, 0]}>
          <mesh raycast={noRaycast}>
            <boxGeometry args={[len, 0.35, 0.12]} />
            <meshStandardMaterial color="#ffc21a" emissive="#ffb300" emissiveIntensity={0.5} />
          </mesh>
          <mesh position={[0, 0.0, 0.07]} raycast={noRaycast}>
            <boxGeometry args={[len, 0.12, 0.05]} />
            <meshStandardMaterial color="#222" />
          </mesh>
        </group>
      ))}
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, 1, z]} castShadow raycast={noRaycast}>
          <cylinderGeometry args={[0.28, 0.28, 2, 8]} />
          <meshStandardMaterial color="#ffc21a" />
        </mesh>
      ))}
    </group>
  );
}

function ShieldDome({ anim, radius }: Pick<FxProps, "anim" | "radius">) {
  const mat = useRef<MeshStandardMaterial>(null);
  const wire = useRef<MeshBasicMaterial>(null);
  useFrame(() => {
    const a = anim.current;
    if (mat.current) {
      mat.current.emissive.copy(a.color);
      mat.current.emissiveIntensity = 0.5 + 0.2 * Math.sin(a.t * 1.5);
    }
    if (wire.current) wire.current.color.copy(a.color).multiplyScalar(1.8);
  });
  const r = radius + 4;
  return (
    <group>
      <mesh raycast={noRaycast}>
        <sphereGeometry args={[r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial ref={mat} color="#0b3a40" transparent opacity={0.16} depthWrite={false} side={DoubleSide} toneMapped={false} />
      </mesh>
      <mesh raycast={noRaycast}>
        <sphereGeometry args={[r * 1.001, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshBasicMaterial ref={wire} wireframe transparent opacity={0.25} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function ProgressBar({ anim, height }: Pick<FxProps, "anim" | "height">) {
  const fill = useRef<Mesh>(null);
  const mat = useRef<MeshStandardMaterial>(null);
  const W = 8;
  useFrame(() => {
    const a = anim.current;
    if (fill.current) {
      const f = Math.max(a.fill, 0.001);
      fill.current.scale.x = f;
      fill.current.position.x = -W / 2 + (W * f) / 2;
    }
    if (mat.current) {
      mat.current.emissive.copy(a.color);
      mat.current.emissiveIntensity = 1.6;
    }
  });
  return (
    <Billboard position={[0, height + 5, 0]}>
      <mesh raycast={noRaycast}>
        <boxGeometry args={[W + 0.6, 0.9, 0.3]} />
        <meshStandardMaterial color="#0a1226" />
      </mesh>
      <mesh ref={fill} position={[0, 0, 0.2]} raycast={noRaycast}>
        <boxGeometry args={[W, 0.5, 0.2]} />
        <meshStandardMaterial ref={mat} color="#111" emissive="#7fa5ad" toneMapped={false} />
      </mesh>
    </Billboard>
  );
}

/** Procedural per-state props used on placeholders (warning beacon, incident barrier, recovery dome + progress). */
export function StateEffects({ anim, radius, height, state, w, d }: FxProps & { state: string; w: number; d: number }) {
  return (
    <>
      <Pop show={state === "warning" || state === "incident"}>
        <Beacon anim={anim} height={height} />
      </Pop>
      <Pop show={state === "incident"}>
        <RectBarrier anim={anim} w={w} d={d} />
      </Pop>
      <Pop show={state === "recovery"}>
        <ShieldDome anim={anim} radius={radius} />
      </Pop>
      <Pop show={state === "recovery"}>
        <ProgressBar anim={anim} height={height} />
      </Pop>
    </>
  );
}

export type SignKind = "warning" | "incident" | "lock";
const signCache = new Map<SignKind, CanvasTexture>();
export function signTexture(kind: SignKind): CanvasTexture {
  const hit = signCache.get(kind);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = kind === "warning" ? "#ffb300" : "#e11d2e";
  g.beginPath();
  g.roundRect(6, 6, 116, 116, 22);
  g.fill();
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  if (kind === "lock") {
    g.fillRect(36, 58, 56, 44);
    g.lineWidth = 9;
    g.beginPath();
    g.arc(64, 56, 20, Math.PI, 0);
    g.stroke();
    g.fillStyle = "#e11d2e";
    g.fillRect(60, 74, 8, 16);
  } else {
    g.beginPath();
    g.moveTo(64, 20);
    g.lineTo(110, 100);
    g.lineTo(18, 100);
    g.closePath();
    g.fill();
    g.fillStyle = kind === "warning" ? "#ffb300" : "#e11d2e";
    g.fillRect(60, 46, 8, 28);
    g.fillRect(60, 80, 8, 8);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  signCache.set(kind, t);
  return t;
}

const badgeCache = new Map<string, CanvasTexture>();
/** Big round state badge (warning triangle / incident cross / recovery shield-check) drawn to a texture. */
export function badgeTexture(kind: "warning" | "incident" | "recovery"): CanvasTexture {
  const hit = badgeCache.get(kind);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const col = kind === "warning" ? "#ffb300" : kind === "incident" ? "#ff2d3d" : "#58c8d8";
  const grad = g.createRadialGradient(128, 128, 20, 128, 128, 124);
  grad.addColorStop(0, "#ffffff22");
  grad.addColorStop(1, col + "55");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(128, 128, 124, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#101440";
  g.beginPath();
  g.arc(128, 128, 98, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 12;
  g.strokeStyle = col;
  g.stroke();
  g.fillStyle = col;
  g.strokeStyle = col;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (kind === "warning") {
    g.beginPath();
    g.moveTo(128, 66);
    g.lineTo(186, 168);
    g.lineTo(70, 168);
    g.closePath();
    g.lineWidth = 12;
    g.stroke();
    g.fillRect(122, 100, 12, 36);
    g.fillRect(122, 144, 12, 12);
  } else if (kind === "incident") {
    g.lineWidth = 22;
    g.beginPath();
    g.moveTo(86, 86);
    g.lineTo(170, 170);
    g.moveTo(170, 86);
    g.lineTo(86, 170);
    g.stroke();
  } else {
    g.lineWidth = 12;
    g.beginPath();
    g.moveTo(128, 64);
    g.lineTo(178, 82);
    g.lineTo(178, 130);
    g.quadraticCurveTo(176, 168, 128, 192);
    g.quadraticCurveTo(80, 168, 78, 130);
    g.lineTo(78, 82);
    g.closePath();
    g.stroke();
    g.lineWidth = 14;
    g.beginPath();
    g.moveTo(104, 126);
    g.lineTo(124, 148);
    g.lineTo(156, 108);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  badgeCache.set(kind, t);
  return t;
}
