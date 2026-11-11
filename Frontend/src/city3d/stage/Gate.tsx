import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { CanvasTexture, Color, SRGBColorSpace, type Group, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from "three";
import { fmtDisplay } from "../../lib/format";
import { noRaycast } from "../fx";
import { useRT } from "./context";

function shieldTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#b45309";
  g.beginPath();
  g.moveTo(64, 10); g.lineTo(108, 26); g.lineTo(108, 64); g.quadraticCurveTo(104, 100, 64, 120); g.quadraticCurveTo(24, 100, 20, 64); g.lineTo(20, 26); g.closePath();
  g.fill();
  g.fillStyle = "#ffe08a";
  g.fillRect(44, 62, 40, 32);
  g.strokeStyle = "#ffe08a"; g.lineWidth = 9;
  g.beginPath(); g.arc(64, 60, 15, Math.PI, 0); g.stroke();
  g.fillStyle = "#b45309"; g.fillRect(60, 74, 8, 12);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
function plaqueTexture(text: string) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 80;
  const g = c.getContext("2d")!;
  g.fillStyle = "#171a46";
  g.beginPath(); g.roundRect(4, 4, 248, 72, 22); g.fill();
  g.strokeStyle = "#ffc23d"; g.lineWidth = 5; g.stroke();
  g.fillStyle = "#ffc23d";
  for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(48, 52 - i * 9, 20, 7, 0, 0, Math.PI * 2); g.fill(); g.strokeStyle = "#171a46"; g.lineWidth = 2; g.stroke(); }
  g.font = "800 44px 'Baloo 2', 'Be Vietnam Pro', sans-serif";
  g.fillStyle = "#ffd873"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(text, 156, 42);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Chunky golden shared-cap arch (REF_06): shield-lock emblems, coin plaque, small in-world fill bar. Sits at the camera-facing corner of the fence. */
export default function Gate({ principalId, sharedCap }: { principalId: string; sharedCap: { spent: string; cap: string } | null }) {
  const rt = useRT();
  const g = useRef<Group>(null);
  const portal = useRef<MeshBasicMaterial>(null);
  const body = useRef<MeshStandardMaterial>(null);
  const fill = useRef<Mesh>(null);
  const capText = sharedCap ? fmtDisplay(BigInt(sharedCap.cap)) : rt.fences.get(principalId)?.cap ?? "";
  const shield = useMemo(shieldTexture, []);
  const plaque = useMemo(() => plaqueTexture(capText), [capText]);
  const ratio = (() => {
    if (!sharedCap) return 0;
    try {
      const cap = BigInt(sharedCap.cap);
      return cap > 0n ? Math.min(1, Number((BigInt(sharedCap.spent) * 1000n) / cap) / 1000) : 0;
    } catch { return 0; }
  })();

  useFrame(({ clock }) => {
    const f = rt.fences.get(principalId);
    if (!f || !g.current) return;
    g.current.position.set(f.cx - f.hx * 0.15, 0.6, f.cz + f.hz + 2);
    g.current.rotation.y = -Math.PI / 4;
    g.current.scale.setScalar(Math.max(0.001, f.alpha) * 1.25);
    g.current.visible = f.alpha > 0.05 && !!f.cap;
    const flash = rt.gateFlash;
    if (portal.current) {
      portal.current.color.set(ratio > 0.8 ? "#ff8a3d" : "#ffc23d").lerp(new Color("#ff2d3d"), flash).multiplyScalar(1.5);
      portal.current.opacity = 0.32 + 0.12 * Math.sin(clock.elapsedTime * 3) + flash * 0.55;
    }
    if (body.current) body.current.emissive.set("#ff9a1f").lerp(new Color("#ff2d3d"), flash).multiplyScalar(0.55 + flash * 1.4);
    if (fill.current) {
      fill.current.scale.x = Math.max(ratio, 0.001);
      fill.current.position.x = -2.6 + 2.6 * ratio;
      (fill.current.material as MeshBasicMaterial).color.set(ratio > 0.8 ? "#ff5a3d" : "#6df08a").multiplyScalar(1.6);
    }
  });

  return (
    <group ref={g} visible={false}>
      {[-4.4, 4.4].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <RoundedBox args={[3.2, 9, 3.2]} radius={0.5} smoothness={3} position={[0, 4.5, 0]} castShadow>
            <meshStandardMaterial ref={x < 0 ? body : undefined} color="#ffb02e" emissive="#ff9a1f" emissiveIntensity={0.55} roughness={0.35} metalness={0.2} />
          </RoundedBox>
          <RoundedBox args={[4.2, 1, 4.2]} radius={0.35} smoothness={2} position={[0, 0.5, 0]}>
            <meshStandardMaterial color="#ffd54a" roughness={0.4} />
          </RoundedBox>
          <mesh position={[0, 4.2, 1.65]} raycast={noRaycast}>
            <planeGeometry args={[2.4, 2.4]} />
            <meshBasicMaterial map={shield} transparent toneMapped={false} />
          </mesh>
        </group>
      ))}
      <RoundedBox args={[12.6, 2.8, 3.4]} radius={0.5} smoothness={3} position={[0, 9.9, 0]} castShadow>
        <meshStandardMaterial color="#ffc23d" emissive="#ffb02e" emissiveIntensity={0.5} roughness={0.35} metalness={0.2} />
      </RoundedBox>
      <mesh position={[0, 9.9, 1.75]} raycast={noRaycast}>
        <planeGeometry args={[6.4, 2]} />
        <meshBasicMaterial map={plaque} transparent toneMapped={false} />
      </mesh>
      <mesh position={[0, 4.4, 0.3]} raycast={noRaycast}>
        <planeGeometry args={[5.6, 8.6]} />
        <meshBasicMaterial ref={portal} transparent depthWrite={false} toneMapped={false} side={2} />
      </mesh>
      {/* in-world fill bar on the arch */}
      <mesh position={[0, 8.0, 1.8]} raycast={noRaycast}>
        <boxGeometry args={[5.4, 0.45, 0.15]} />
        <meshBasicMaterial color="#171a46" />
      </mesh>
      <mesh ref={fill} position={[-2.6, 8.0, 1.92]} raycast={noRaycast}>
        <boxGeometry args={[5.2, 0.3, 0.15]} />
        <meshBasicMaterial color="#6df08a" toneMapped={false} />
      </mesh>
    </group>
  );
}
