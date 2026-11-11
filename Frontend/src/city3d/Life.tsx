import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, MathUtils, Object3D, type InstancedMesh } from "three";
import { useCityStore } from "./cityStore";
import { ASSEMBLY, getPlacement } from "./layout";
import { noRaycast } from "./fx";

const A = 7;

/** Green evacuation arrows (traffic lives in Traffic.tsx). No people. */
export default function Life() {
  const arrows = useRef<InstancedMesh>(null);
  const o = useMemo(() => new Object3D(), []);
  const shown = useRef(true); // matrices start collapsed on the first frame
  const B04 = getPlacement("B04").position;
  const START: [number, number] = [B04[0] + 4, B04[2] + 12];
  const END: [number, number] = [ASSEMBLY[0] + 1, ASSEMBLY[1] - 1];

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const sc = useCityStore.getState().scenario;

    const evac = sc.id === "evac";
    const show = evac && sc.elapsed >= 3 && sc.elapsed < 17;
    if (!show && !shown.current) return; // nothing visible and nothing to hide: skip the matrix work
    shown.current = show;
    for (let i = 0; i < A; i++) {
      const u = (i / A + t * 0.25) % 1;
      o.position.set(MathUtils.lerp(START[0], END[0], u), 0.5 + Math.sin(t * 6 + i) * 0.1, MathUtils.lerp(START[1], END[1], u));
      o.rotation.set(-Math.PI / 2, 0, -Math.atan2(END[0] - START[0], END[1] - START[1]) + Math.PI);
      o.scale.setScalar(show ? 1 : 0.0001);
      o.updateMatrix();
      arrows.current?.setMatrixAt(i, o.matrix);
    }
    if (arrows.current) {
      arrows.current.instanceMatrix.needsUpdate = true;
      arrows.current.visible = show;
    }
  });

  return (
    <group>
      <instancedMesh ref={arrows} args={[undefined, undefined, A]} frustumCulled={false} raycast={noRaycast}>
        <coneGeometry args={[1.1, 2.2, 3]} />
        <meshBasicMaterial color={new Color("#3dff7a").multiplyScalar(1.4)} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
