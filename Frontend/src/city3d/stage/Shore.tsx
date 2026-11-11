import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { ToyLabel } from "./ToyLabel";
import { Color, Object3D, type InstancedMesh, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial } from "three";
import { hoverNode, pickNode } from "./focus";
import { env } from "../env";
import { noRaycast } from "../fx";
import { useRT } from "./context";
import { BARGE, FUNDS_PATH, ISLET, MOCKDEX, TONE_COLOR, TREASURY, houseSpot } from "./world";


function pickProps(id: string) {
  return {
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      pickNode(id);
    },
    onPointerOver: () => {
      hoverNode(id);
      document.body.style.cursor = "pointer";
    },
    onPointerOut: () => {
      hoverNode(null);
      document.body.style.cursor = "";
    },
  };
}

/** Ring that glows red / tone for a node (spread + highlight). */
function NodeRing({ id, r, y = 0.5 }: { id: string; r: number; y?: number }) {
  const rt = useRT();
  const m = useRef<MeshBasicMaterial>(null);
  const mesh = useRef<Mesh>(null);
  const c = useMemo(() => new Color(), []);
  useFrame(({ clock }) => {
    const a = rt.amt(id);
    if (!m.current || !mesh.current) return;
    const g = Math.max(a.red, a.hl);
    mesh.current.visible = g > 0.02;
    c.set(a.red > a.hl ? "#ff2d3d" : TONE_COLOR[a.tone]);
    m.current.color.copy(c).multiplyScalar(1.7);
    m.current.opacity = g * (0.55 + 0.35 * Math.sin(clock.elapsedTime * 6));
    mesh.current.scale.setScalar(1 + 0.06 * Math.sin(clock.elapsedTime * 5));
  });
  return (
    <mesh ref={mesh} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
      <ringGeometry args={[r, r + 0.9, 40]} />
      <meshBasicMaterial ref={m} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

function House({ id, name, approved, stranger, showLabel }: { id: string; name: string; approved: boolean; stranger: boolean; showLabel: boolean }) {
  const [x, z] = houseSpot(id, 0);
  const win = useRef<MeshStandardMaterial>(null);
  useFrame(() => {
    if (win.current) win.current.emissiveIntensity = 0.3 + env.night * 1.8;
  });
  const wall = stranger ? "#3b3556" : "#f1e7ff";
  const roof = stranger ? "#2a2440" : id.includes("cloud") ? "#38bdf8" : id.includes("intl") ? "#f472b6" : "#fbbf24";
  return (
    <group position={[x, 0, z]} {...pickProps(`r:${id}`)}>
      <mesh position={[0, 0.2, 0]} receiveShadow>
        <cylinderGeometry args={[7.5, 8, 0.8, 24]} />
        <meshStandardMaterial color={stranger ? "#4c6f4a" : "#6cc864"} roughness={0.9} />
      </mesh>
      <RoundedBox args={[7, 5, 6]} radius={0.4} smoothness={2} position={[0, 3.2, 0]} castShadow>
        <meshStandardMaterial color={wall} roughness={0.6} />
      </RoundedBox>
      <mesh position={[0, 7.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow>
        <coneGeometry args={[5.6, 3.2, 4]} />
        <meshStandardMaterial color={roof} roughness={0.55} />
      </mesh>
      <mesh position={[-1.7, 3.4, 3.05]}>
        <boxGeometry args={[1.6, 1.8, 0.15]} />
        <meshStandardMaterial ref={win} color="#5a3a10" emissive="#ffc35a" emissiveIntensity={1} />
      </mesh>
      <mesh position={[1.7, 3.4, 3.05]}>
        <boxGeometry args={[1.6, 1.8, 0.15]} />
        <meshStandardMaterial color="#5a3a10" emissive="#ffc35a" emissiveIntensity={1} />
      </mesh>
      <mesh position={[0, 1.9, 3.05]}>
        <boxGeometry args={[1.5, 2.2, 0.15]} />
        <meshStandardMaterial color="#6b3fa0" />
      </mesh>
      {approved && (
        <group position={[4.6, 0.6, 3.6]}>
          <mesh position={[0, 2, 0]} raycast={noRaycast}>
            <cylinderGeometry args={[0.1, 0.1, 4, 6]} />
            <meshStandardMaterial color="#cbd5e1" />
          </mesh>
          <mesh position={[0.9, 3.5, 0]} raycast={noRaycast}>
            <boxGeometry args={[1.8, 1.2, 0.1]} />
            <meshBasicMaterial color={new Color("#2dd4bf").multiplyScalar(1.4)} toneMapped={false} />
          </mesh>
        </group>
      )}
      <NodeRing id={`r:${id}`} r={9} />
      {showLabel && (
        <ToyLabel id={`r:${id}`} position={[0, 10.5, 0]} dot={approved ? "#14b8a6" : "#ef4444"} glyph={approved ? "✓" : "✕"}>
          {name}
        </ToyLabel>
      )}
    </group>
  );
}

function Islet() {
  return (
    <group position={[ISLET[0], 0, ISLET[1]]}>
      <mesh position={[0, -1.4, 0]} receiveShadow>
        <cylinderGeometry args={[11, 13, 3.4, 20]} />
        <meshStandardMaterial color="#6d6a8c" roughness={0.9} />
      </mesh>
      {[[-9, 4], [8, -6], [9, 6]].map(([rx, rz], i) => (
        <mesh key={i} position={[rx, 0.4, rz]} castShadow>
          <icosahedronGeometry args={[1.6 + i * 0.3, 0]} />
          <meshStandardMaterial color="#8d88b0" flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Barge({ labels }: { labels: Set<string> }) {
  const rt = useRT();
  const g = useRef<Object3D>(null);
  const lamp = useRef<MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (g.current) {
      g.current.position.y = -1.7 + Math.sin(t * 1.2) * 0.2;
      g.current.rotation.z = Math.sin(t * 0.9) * 0.04;
    }
    if (lamp.current) lamp.current.emissiveIntensity = 1.5 + 1.2 * Math.sin(t * 4) + rt.amt("pr:EvilDEX").hl * 2;
  });
  return (
    <group position={[BARGE[0], 0, BARGE[1]]} rotation={[0, -0.5, 0]} {...pickProps("pr:evil_dex")}>
      <group ref={g}>
        <mesh castShadow>
          <boxGeometry args={[7, 2, 16]} />
          <meshStandardMaterial color="#1c1a2e" roughness={0.6} />
        </mesh>
        <mesh position={[0, 2, 3]} castShadow>
          <boxGeometry args={[4, 3, 4.5]} />
          <meshStandardMaterial color="#2b2640" roughness={0.6} />
        </mesh>
        <mesh position={[0, 4.2, 3]}>
          <sphereGeometry args={[0.7, 10, 8]} />
          <meshStandardMaterial ref={lamp} color="#300" emissive="#ff2d3d" toneMapped={false} />
        </mesh>
      </group>
      {labels.has("pr:evil_dex") && <ToyLabel id="pr:evil_dex" position={[0, 9, 0]} dot="#ef4444" glyph="✕">EvilDEX</ToyLabel>}
      <NodeRing id="pr:evil_dex" r={9} y={-1.2} />
    </group>
  );
}

function Treasury({ labels }: { labels: Set<string> }) {
  const rt = useRT();
  void rt;
  return (
    <group position={[TREASURY[0], 0, TREASURY[1]]} {...pickProps("treasury")}>
      <mesh position={[0, -1.3, 0]} receiveShadow>
        <cylinderGeometry args={[15, 17, 3.4, 28]} />
        <meshStandardMaterial color="#a9a3d8" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[13.5, 14, 0.5, 28]} />
        <meshStandardMaterial color="#62b85c" roughness={0.9} />
      </mesh>
      <RoundedBox args={[16, 7, 10]} radius={0.5} smoothness={2} position={[0, 4.2, 0]} castShadow>
        <meshStandardMaterial color="#e9e6ff" roughness={0.55} />
      </RoundedBox>
      <mesh position={[0, 8.6, 0]} castShadow>
        <boxGeometry args={[18, 1.4, 12]} />
        <meshStandardMaterial color="#b8b1f0" roughness={0.5} />
      </mesh>
      <mesh position={[0, 10.4, 0]} castShadow>
        <coneGeometry args={[9.5, 3.4, 4]} />
        <meshStandardMaterial color="#8c7cf0" roughness={0.5} />
      </mesh>
      {[-5.5, -1.8, 1.8, 5.5].map((x) => (
        <mesh key={x} position={[x, 4, 5.4]} castShadow>
          <cylinderGeometry args={[0.7, 0.8, 7, 10]} />
          <meshStandardMaterial color="#ffffff" roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 7.4, 5.6]}>
        <boxGeometry args={[7, 1.5, 0.2]} />
        <meshStandardMaterial color="#1b1f4e" emissive="#ffc23d" emissiveIntensity={0.9} toneMapped={false} />
      </mesh>
      <NodeRing id="treasury" r={17} y={0.7} />
      {labels.has("treasury") && <ToyLabel id="treasury" position={[0, 16, 0]} dot="#ffb02e">Quỹ chính</ToyLabel>}
    </group>
  );
}

/** Gold coins flowing treasury → bridge → streets → vault (B03). */
function FundsFlow() {
  const ref = useRef<InstancedMesh>(null);
  const o = useMemo(() => new Object3D(), []);
  const N = 16;
  const lens = useMemo(() => {
    const l = [0];
    for (let i = 1; i < FUNDS_PATH.length; i++) l.push(l[i - 1] + Math.hypot(FUNDS_PATH[i][0] - FUNDS_PATH[i - 1][0], FUNDS_PATH[i][1] - FUNDS_PATH[i - 1][1]));
    return l;
  }, []);
  useFrame(({ clock }) => {
    const m = ref.current;
    if (!m) return;
    const total = lens[lens.length - 1];
    for (let i = 0; i < N; i++) {
      const d = ((i / N + clock.elapsedTime * 0.07) % 1) * total;
      let s = 1;
      while (s < lens.length - 1 && lens[s] < d) s++;
      const u = (d - lens[s - 1]) / (lens[s] - lens[s - 1]);
      const [ax, az] = FUNDS_PATH[s - 1];
      const [bx, bz] = FUNDS_PATH[s];
      o.position.set(ax + (bx - ax) * u, 1.3 + Math.sin(clock.elapsedTime * 4 + i) * 0.15, az + (bz - az) * u);
      o.rotation.set(Math.PI / 2, clock.elapsedTime * 3 + i, 0);
      o.scale.setScalar(1);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} frustumCulled={false} raycast={noRaycast}>
      <cylinderGeometry args={[0.7, 0.7, 0.22, 14]} />
      <meshBasicMaterial color={new Color("#ffc23d").multiplyScalar(2)} toneMapped={false} />
    </instancedMesh>
  );
}

function MockDexFlag({ labels }: { labels: Set<string> }) {
  return (
    <group position={[MOCKDEX[0], 0, MOCKDEX[1]]} {...pickProps("pr:MockDEX")}>
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 6, 6]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>
      <mesh position={[1.4, 5.2, 0]}>
        <boxGeometry args={[2.8, 1.5, 0.1]} />
        <meshBasicMaterial color={new Color("#2dd4bf").multiplyScalar(1.4)} toneMapped={false} />
      </mesh>
      <NodeRing id="pr:MockDEX" r={4} />
      {labels.has("pr:MockDEX") && <ToyLabel id="pr:MockDEX" position={[0, 7.6, 0]} dot="#14b8a6" glyph="✓">MockDEX</ToyLabel>}
    </group>
  );
}

export default function Shore({ houses, approved, labels }: { houses: string[]; approved: Set<string>; labels: Set<string> }) {
  return (
    <group>
      <Treasury labels={labels} />
      <FundsFlow />
      <Islet />
      <Barge labels={labels} />
      <MockDexFlag labels={labels} />
      {houses.map((id) => (
        <House key={id} id={id} name={id.replace(/_/g, " ")} approved={approved.has(id)} stranger={id === "stranger_wallet"} showLabel={labels.has(`r:${id}`)} />
      ))}
    </group>
  );
}
