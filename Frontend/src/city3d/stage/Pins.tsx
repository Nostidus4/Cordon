import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { Color, type Group, type Mesh, type MeshBasicMaterial } from "three";
import { hoverNode, pickNode } from "./focus";
import { noRaycast } from "../fx";
import { useRT } from "./context";
import { ToyLabel } from "./ToyLabel";
import { pinTexture } from "./icons";
import { KIND_COLOR, TONE_COLOR } from "./world";

const GREY = new Color("#8a90a8");
const RED = new Color("#ff3b4a");

/** Toy token pin: stem to the ground (HOLDS_KEY), round icon token (person / robot / server), optional label. */
export function Pin({ id, showLabel }: { id: string; showLabel: boolean }) {
  const rt = useRT();
  const root = useRef<Group>(null);
  const stem = useRef<Mesh>(null);
  const token = useRef<Group>(null);
  const mat = useRef<MeshBasicMaterial>(null);
  const halo = useRef<MeshBasicMaterial>(null);
  const haloMesh = useRef<Mesh>(null);
  const foot = useRef<MeshBasicMaterial>(null);
  const base = useMemo(() => new Color(), []);
  const hlColor = useMemo(() => new Color(), []);
  const kind = rt.pins.get(id)?.kind ?? "HUMAN";
  const tex = useMemo(() => pinTexture(kind), [kind]);

  useFrame(({ clock }) => {
    const p = rt.pins.get(id);
    if (!p || !root.current || !stem.current || !token.current || !mat.current) return;
    const a = rt.amt(id);
    root.current.position.set(p.pos.x, 0, p.pos.z);
    const h = Math.max(p.pos.y, 0.5);
    stem.current.scale.y = h;
    stem.current.position.y = h / 2;
    token.current.position.y = h;
    base.set(KIND_COLOR[p.kind] ?? "#ffffff").lerp(GREY, p.sink * 0.85).lerp(RED, a.red);
    mat.current.color.copy(base).multiplyScalar(1 + a.red * 0.35);
    const pulse = 0.55 + 0.45 * Math.sin(clock.elapsedTime * 5);
    const glow = Math.max(a.red * 0.9, a.hl * pulse);
    if (halo.current && haloMesh.current) {
      hlColor.set(a.red > a.hl ? "#ff2d3d" : TONE_COLOR[a.tone]);
      halo.current.color.copy(hlColor).multiplyScalar(1.6);
      halo.current.opacity = glow * 0.85;
      haloMesh.current.scale.setScalar(1.15 + glow * 0.25 + (a.red > 0.3 ? 0.1 * Math.sin(clock.elapsedTime * 8) : 0));
    }
    if (foot.current) {
      foot.current.color.copy(base).multiplyScalar(1.3);
      foot.current.opacity = 0.55 * (1 - p.sink * 0.5);
    }
  });

  return (
    <group ref={root}>
      <mesh ref={stem} raycast={noRaycast}>
        <cylinderGeometry args={[0.09, 0.09, 1, 6]} />
        <meshBasicMaterial color="#cfd6ff" transparent opacity={0.45} />
      </mesh>
      <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <ringGeometry args={[1.2, 2.0, 24]} />
        <meshBasicMaterial ref={foot} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={token}>
        <Billboard>
          <mesh ref={haloMesh} raycast={noRaycast} position={[0, 0, -0.02]}>
            <circleGeometry args={[3.1, 24]} />
            <meshBasicMaterial ref={halo} transparent depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh
            onClick={(e) => {
              e.stopPropagation();
              pickNode(id);
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              hoverNode(id);
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              hoverNode(null);
              document.body.style.cursor = "";
            }}
          >
            <circleGeometry args={[2.3, 28]} />
            <meshBasicMaterial ref={mat} map={tex} transparent toneMapped={false} />
          </mesh>
        </Billboard>
        {showLabel && (
          <ToyLabel id={id} position={[0, 3.2, 0]} dot={KIND_COLOR[kind] ?? "#a78bfa"}>
            {rt.pins.get(id)?.label}
          </ToyLabel>
        )}
      </group>
    </group>
  );
}
