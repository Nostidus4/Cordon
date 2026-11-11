import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { asset, DRACO } from "./assets";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Group, Mesh, type Material, type Object3D } from "three";
import { markReady, nowS, timeline, type Cluster } from "./assembly";
import { applyEnv, classify, lampPositions, newEnvMats } from "./envMats";
import { noRaycast } from "./fx";
import Island, { LAMP_SPOTS } from "./Island";
import Life from "./Life";
import Traffic from "./Traffic";
import { Fireflies, LampPools } from "./NightFx";
import { litAt } from "./assembly";
import { POP_ORDER } from "./assembly";
import Water, { setWaterLamps, waterMaterial } from "./Water";

/** Node name -> assembly cluster that "sprouts" (scales up from the ground) when the island has risen. */
const SPROUT: [string, Cluster][] = [
  ["city_trees", "trees"],
  ["city_lamps", "lamps"],
  ["city_flowers", "flowers"],
  ["city_flags", "flowers"],
  ["city_water_detail", "boats"],
];

/** Static scenery never changes: freeze local matrices and drop it from raycasting (only buildings are interactive). */
function freezeStatic(root: Object3D, keep: Set<Object3D> = new Set()) {
  root.traverse((o) => {
    const m = o as Mesh;
    if (m.isMesh) {
      m.receiveShadow = true;
      m.raycast = noRaycast;
    }
    if (keep.has(o)) return;
    o.updateMatrix();
    o.matrixAutoUpdate = false;
  });
}

function BaseGlb({ file, onLamps, onWater }: { file: string; onLamps: (p: [number, number][]) => void; onWater: () => void }) {
  const gltf = useGLTF(asset(`models/city/${file}`), DRACO, true);
  const rise = useRef<Group>(null);
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
      // foam is drawn by the water shader
      if (arr.some((mm) => mm.name === "city_foam") && arr.length === 1) m.visible = false;
    });
    // legacy glbs: hide parked vehicles (moving cars are Traffic.tsx). The optimised glb no longer contains them.
    root.traverse((o) => {
      if (/vehicle|^car|bus|van/i.test(o.name)) o.visible = false;
    });
    // the sea stays put while the island rises out of it
    const water = root.getObjectByName("city_water") ?? null;
    if (water) root.remove(water);
    const sprouts = SPROUT.map(([name, cluster]) => ({ node: root.getObjectByName(name), cluster })).filter((s): s is { node: Object3D; cluster: Cluster } => !!s.node);
    freezeStatic(root, new Set(sprouts.map((s) => s.node)));
    if (water) freezeStatic(water);
    return { root, water, sprouts, e, hasWater };
  }, [gltf]);
  useEffect(() => {
    if (import.meta.env.DEV) {
      const w = window as unknown as { __glb?: number };
      w.__glb = (w.__glb ?? 0) + 1;
    }
    const l = lampPositions(setup.root);
    onLamps(l);
    setWaterLamps(l);
    if (setup.hasWater) onWater();
    markReady("base");
  }, [setup, onLamps, onWater]);
  useFrame(() => {
    const tl = timeline;
    const lit = litAt(POP_ORDER.length);
    if (tl) {
      const now = nowS();
      const k = tl.island(now);
      if (rise.current) {
        rise.current.visible = k > 0;
        rise.current.position.y = -(1 - k) * 8;
      }
      for (const s of setup.sprouts) {
        const u = tl.sprout(s.cluster, now);
        s.node.visible = u > 0;
        s.node.scale.y = u;
      }
    }
    applyEnv(setup.e, lit);
  });
  return (
    <>
      <group ref={rise}>
        <primitive object={setup.root} />
      </group>
      {setup.water && <primitive object={setup.water} />}
    </>
  );
}

/** Islets, houses, boats, foam: the last thing to arrive; rises out of the sea. */
function Surroundings({ file }: { file: string }) {
  const gltf = useGLTF(asset(`models/city/${file}`), DRACO, true);
  const g = useRef<Group>(null);
  const root = useMemo(() => {
    const r = gltf.scene as Object3D;
    freezeStatic(r);
    return r;
  }, [gltf]);
  useEffect(() => {
    if (import.meta.env.DEV) {
      const w = window as unknown as { __glb?: number };
      w.__glb = (w.__glb ?? 0) + 1;
    }
    markReady("surr");
  }, [root]);
  useFrame(() => {
    const tl = timeline;
    if (!tl || !g.current) return;
    const k = tl.surroundings(nowS());
    g.current.visible = k > 0;
    g.current.position.y = -(1 - k) * 8;
  });
  return (
    <group ref={g}>
      <primitive object={root} />
    </group>
  );
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
      <Water y={glbWater || baseFile ? -3.35 : -2.2} />
      {baseFile ? (
        <Suspense fallback={null}>
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
