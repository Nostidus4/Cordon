import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { asset, DRACO } from "./assets";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Mesh, type Material, type Object3D } from "three";
import { applyEnv, classify, lampPositions, newEnvMats } from "./envMats";
import Island, { LAMP_SPOTS } from "./Island";
import Life from "./Life";
import Traffic from "./Traffic";
import { Fireflies, LampPools } from "./NightFx";
import Water, { setWaterLamps, waterMaterial } from "./Water";

function BaseGlb({ file, onLamps, onWater }: { file: string; onLamps: (p: [number, number][]) => void; onWater: () => void }) {
  const gltf = useGLTF(asset(`models/city/${file}`), DRACO, true);
  const setup = useMemo(() => {
    const root = gltf.scene as Object3D;
    const e = newEnvMats();
    const seen = new Map<Material, Material>();
    let hasWater = false;
    root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const arr = Array.isArray(m.material) ? m.material : [m.material];
      const out = arr.map((mm) => {
        if (mm.name === "city_water_m") {
          hasWater = true;
          return waterMaterial();
        }
        let c = seen.get(mm);
        if (!c) {
          c = mm.clone();
          seen.set(mm, c);
          classify(c, e);
        }
        return c;
      });
      m.material = Array.isArray(m.material) ? out : out[0];
      m.receiveShadow = true;
      // foam is drawn by the water shader
      if (arr.some((mm) => mm.name === "city_foam") && arr.length === 1) m.visible = false;
    });
    // no parked cars at all: hide every vehicle mesh of the base glb (moving cars are Traffic.tsx)
    root.traverse((o) => {
      if (/vehicle|^car|bus|van/i.test(o.name)) o.visible = false;
    });
    return { root, e, hasWater };
  }, [gltf]);
  useEffect(() => {
    if (import.meta.env.DEV) { const w = window as unknown as { __glb?: number }; w.__glb = (w.__glb ?? 0) + 1; }
    const l = lampPositions(setup.root);
    onLamps(l);
    setWaterLamps(l);
    if (setup.hasWater) onWater();
  }, [setup, onLamps, onWater]);
  useFrame(() => applyEnv(setup.e));
  return (
    <>
      <primitive object={setup.root} />
    </>
  );
}

/** Water + island (base glb when listed, else procedural) + life + night effects. */
function Surroundings({ file }: { file: string }) {
  const gltf = useGLTF(asset(`models/city/${file}`), DRACO, true);
  const root = useMemo(() => {
    const r = gltf.scene as Object3D;
    r.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) m.receiveShadow = true;
    });
    return r;
  }, [gltf]);
  useEffect(() => {
    if (import.meta.env.DEV) { const w = window as unknown as { __glb?: number }; w.__glb = (w.__glb ?? 0) + 1; }
  }, [root]);
  return <primitive object={root} />;
}

export default function City({ baseFile, surroundings }: { baseFile: string | null; surroundings: string | null }) {
  const [lamps, setLamps] = useState<[number, number][] | null>(null);
  const [glbWater, setGlbWater] = useState(false);
  const onWater = useCallback(() => setGlbWater(true), []);
  useEffect(() => {
    if (!baseFile) setWaterLamps(LAMP_SPOTS);
  }, [baseFile]);
  return (
    <>
      <Water y={glbWater ? -3.35 : -2.2} />
      {baseFile ? (
        <Suspense fallback={<Island />}>
          <BaseGlb file={baseFile} onLamps={setLamps} onWater={onWater} />
        </Suspense>
      ) : (
        <Island />
      )}
      {surroundings && (
        <Suspense fallback={null}>
          <Surroundings file={surroundings} />
        </Suspense>
      )}
      <Traffic />
      <Life />
      <LampPools spots={lamps ?? LAMP_SPOTS} />
      <Fireflies />
    </>
  );
}
