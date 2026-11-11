import { Component, Suspense, useCallback, useRef, useState, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard } from "@react-three/drei";
import { MathUtils, type Group, type Mesh, type MeshBasicMaterial, type Vector3 } from "three";
import { useBuildingAnim } from "./anim";
import { STATE_COLOR, type BuildingDef } from "./buildings";
import { stageHooks, useCityStore } from "./cityStore";
import type { BuildingCode } from "../stage/contract";
import { badgeTexture, noRaycast } from "./fx";
import GlbBuilding from "./GlbBuilding";
import LabelCard from "./LabelCard";
import { getPlacement } from "./layout";
import PlaceholderBuilding from "./PlaceholderBuilding";

class Boundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(err: unknown) {
    console.warn("[city3d] glb failed to load, using placeholder", err);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function Building({ def, hasGlb }: { def: BuildingDef; hasGlb: boolean }) {
  const { position, rotationY } = getPlacement(def.code);
  const anim = useBuildingAnim(def.code);
  const state = useCityStore((s) => s.states[def.code]);
  const vaultLock = useCityStore((s) => s.scenario.id === "vault");
  const select = useCityStore((s) => s.select);
  const hover = useCityStore((s) => s.hover);
  const lift = useRef<Group>(null);
  const ring = useRef<Group>(null);
  const badge = useRef<Mesh>(null);
  const badgeMat = useRef<MeshBasicMaterial>(null);
  const pulse = useRef<Mesh>(null);
  const pulseMat = useRef<MeshBasicMaterial>(null);
  const [hotspot, setHotspot] = useState<Vector3 | null>(null);
  const onHotspot = useCallback((v: Vector3 | null) => setHotspot(v), []);

  // cartoon squash-and-stretch bounce on hover/select
  useFrame(() => {
    const a = anim.current;
    if (lift.current) {
      lift.current.scale.set(1 - 0.035 * a.bounce, 1 + 0.08 * a.bounce, 1 - 0.035 * a.bounce);
      lift.current.position.y = a.hover * 0.5;
    }
    const ab = a.state !== "normal";
    if (badge.current && badgeMat.current) {
      const s = MathUtils.damp(badge.current.scale.x, ab ? 1 : 0, 7, 1 / 60);
      badge.current.scale.setScalar(Math.max(s, 0.0001) * (1 + 0.08 * Math.sin(a.t * (a.state === "incident" ? 7 : 3))));
      badge.current.position.y = Math.sin(a.t * 2.2) * 0.5;
      badge.current.visible = s > 0.02;
      if (ab) badgeMat.current.map = badgeTexture(a.state as "warning" | "incident" | "recovery");
    }
    if (pulse.current && pulseMat.current) {
      pulse.current.visible = ab;
      const u = (a.t * (a.state === "incident" ? 1.1 : 0.55)) % 1;
      pulse.current.scale.setScalar(0.8 + u * 0.9);
      pulseMat.current.opacity = (1 - u) * 0.85;
      pulseMat.current.color.copy(a.color);
    }
    if (ring.current) {
      ring.current.visible = a.hover > 0.02;
      ring.current.scale.setScalar(0.92 + 0.08 * a.hover + 0.02 * Math.sin(a.t * 3));
    }
  });

  const placeholder = <PlaceholderBuilding def={def} anim={anim} state={state} lockSign={def.code === "B03" && vaultLock} />;
  const tagPos: [number, number, number] = hotspot
    ? [hotspot.x, hotspot.y - 1 + (state === "normal" ? 0 : 6), hotspot.z]
    : [0, def.dims[2] + 9 + (state === "normal" ? 0 : 3), 0];
  const badgeY = hotspot ? hotspot.y + 5 : def.dims[2] + 6;
  const [w, d] = def.dims;
  const rr = Math.hypot(w, d) / 2 + 2;

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <group ref={ring} visible={false} raycast={noRaycast}>
        <mesh position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
          <ringGeometry args={[rr, rr + 0.9, 64]} />
          <meshBasicMaterial color={state === "normal" ? "#7ee7ff" : STATE_COLOR[state]} transparent opacity={0.85} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={pulse} position={[0, 0.45, 0]} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={noRaycast}>
        <ringGeometry args={[rr * 0.9, rr * 0.9 + 0.7, 64]} />
        <meshBasicMaterial ref={pulseMat} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <Billboard position={[hotspot ? hotspot.x : 0, badgeY, hotspot ? hotspot.z : 0]} raycast={noRaycast}>
        <mesh ref={badge} scale={0.0001} visible={false} raycast={noRaycast}>
          <planeGeometry args={[7, 7]} />
          <meshBasicMaterial ref={badgeMat} transparent toneMapped={false} depthTest={false} />
        </mesh>
      </Billboard>
      <group
        ref={lift}
        onPointerOver={(e) => {
          e.stopPropagation();
          hover(def.code);
          stageHooks.onHover?.({ type: "building", code: def.code as BuildingCode });
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          if (useCityStore.getState().hovered === def.code) hover(null);
          stageHooks.onHover?.(null);
          document.body.style.cursor = "";
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (stageHooks.active) stageHooks.onPick?.({ type: "building", code: def.code as BuildingCode });
          else select(def.code);
        }}
      >
        {hasGlb ? (
          <Boundary fallback={placeholder}>
            <Suspense fallback={placeholder}>
              <GlbBuilding code={def.code} anim={anim} onHotspot={onHotspot} />
            </Suspense>
          </Boundary>
        ) : (
          placeholder
        )}
      </group>
      <LabelCard def={def} position={tagPos} />
    </group>
  );
}
