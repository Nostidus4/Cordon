import { useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { asset, DRACO } from "./assets";
import { litAt, markReady, POP_ORDER } from "./assembly";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Box3, Group, MathUtils, Mesh, Vector3, type Material, type MeshStandardMaterial, type Object3D } from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { STATES, type BuildingState } from "./buildings";
import type { Anim } from "./anim";
import { noRaycast } from "./fx";
import { applyEnv, classify, newEnvMats } from "./envMats";
import { env } from "./env";
import { applyRim } from "./rim";

interface Props {
  code: string;
  anim: MutableRefObject<Anim>;
  onHotspot: (v: Vector3 | null) => void;
}

const originalRaycast = Mesh.prototype.raycast;
type Std = MeshStandardMaterial;
type Kind = "spin" | "beacon" | "pop" | "fill" | "fade" | "holo";

function tintHidden(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (p.name.toLowerCase().includes("tint")) return true;
  return false;
}

function underNode(o: Object3D, name: string): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (p.name === name) return true;
  return false;
}

function kindOf(name: string): Kind | null {
  const n = name.toLowerCase();
  if (n.includes("progress") && n.includes("fill")) return "fill";
  if (n.includes("barrier")) return "pop";
  if (n.includes("dome")) return "fade";
  if (n.includes("hologram") && n.includes("shield")) return "holo";
  if (n.includes("beacon") && !n.includes("base")) return "beacon";
  if (n.includes("ring")) return "spin";
  return null;
}

interface FxItem {
  pivot: Group;
  kind: Kind;
  axis: "x" | "z";
  baseY: number;
  mats: { m: Std; opacity: number }[];
}

function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

/** Loads /models/city/<code>.glb (Draco + Meshopt), toggles state groups by name, animates keyword-named parts about their own pivots. */
export default function GlbBuilding({ code, anim, onHotspot }: Props) {
  const gltf = useGLTF(asset(`models/city/${code}.glb`), DRACO, true);

  const setup = useMemo(() => {
    const root = clone(gltf.scene) as Object3D;
    const glow: Std[] = [];
    const identity: Std[] = [];
    const groups = new Map<BuildingState, Object3D>();
    const cloned = new Map<Material, Material>();
    const envMats = newEnvMats();
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) {
        // only the building body casts (the shadow map is static-ish: small props / decals / state signs would just cost draw calls)
        mesh.castShadow = underNode(mesh, `${code}_static`);
        mesh.receiveShadow = true;
        const arr = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const out = arr.map((m) => {
          let c = cloned.get(m);
          if (!c) {
            c = m.clone();
            cloned.set(m, c);
            if (m.name.endsWith("_glow")) {
              (c as Std).toneMapped = false;
              glow.push(c as Std);
            } else if (m.name.endsWith("_identity")) identity.push(c as Std);
            classify(c, envMats);
            applyRim(c, anim.current.rim);
          }
          return c;
        });
        mesh.material = Array.isArray(mesh.material) ? out : out[0];
      }
    });
    // translucent "tint" shells read badly at city scale: hide them (rim glow replaces them)
    root.traverse((o) => {
      if (o.name.toLowerCase().includes("tint")) {
        o.visible = false;
        o.traverse((c) => ((c as Mesh).raycast = noRaycast));
      }
    });
    root.updateMatrixWorld(true);

    const fx: FxItem[] = [];
    for (const s of STATES) {
      const g = root.getObjectByName(`${code}_state_${s}`);
      if (!g) continue;
      groups.set(s, g);
      const found: { obj: Object3D; kind: Kind }[] = [];
      const taken = new Set<Object3D>();
      g.traverse((o) => {
        if (o === g) return;
        let p = o.parent;
        while (p && p !== g) {
          if (taken.has(p)) return;
          p = p.parent;
        }
        const kind = kindOf(o.name);
        if (kind) {
          taken.add(o);
          found.push({ obj: o, kind });
        }
      });
      for (const { obj, kind } of found) {
        const box = new Box3().setFromObject(obj);
        if (box.isEmpty() || !obj.parent) continue;
        const size = box.getSize(new Vector3());
        const axis: "x" | "z" = size.x >= size.z ? "x" : "z";
        const c = box.getCenter(new Vector3());
        if (kind === "pop") c.y = box.min.y;
        if (kind === "fill") c[axis] = box.min[axis];
        const parent = obj.parent;
        const pivot = new Group();
        pivot.position.copy(parent.worldToLocal(c.clone()));
        parent.add(pivot);
        pivot.updateMatrixWorld(true);
        pivot.attach(obj);
        const mats: FxItem["mats"] = [];
        obj.traverse((cm) => {
          const m = (cm as Mesh).material;
          if (m) for (const mm of (Array.isArray(m) ? m : [m]) as Std[]) mats.push({ m: mm, opacity: mm.opacity });
        });
        fx.push({ pivot, kind, axis, baseY: pivot.position.y, mats });
      }
    }
    // freeze local matrices of everything static (animated pivots keep auto-update)
    const pivots = new Set<Object3D>(fx.map((f) => f.pivot));
    root.traverse((o) => {
      if (pivots.has(o)) return;
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    });
    const hs = root.getObjectByName(`${code}_hotspot`);
    let hotspot: Vector3 | null = null;
    if (hs) hotspot = hs.getWorldPosition(new Vector3());
    return { root, glow, identity, groups, fx, hotspot, envMats };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf, code]);

  useEffect(() => {
    if (import.meta.env.DEV) { const w = window as unknown as { __glb?: number }; w.__glb = (w.__glb ?? 0) + 1; }
  }, [setup]);
  useEffect(() => {
    onHotspot(setup.hotspot);
    markReady(code);
  }, [setup, onHotspot, code]);
  useEffect(
    () => () => {
      // materials are per-instance clones: release them with the building
      const seen = new Set<Material>();
      setup.root.traverse((o) => {
        const m = (o as Mesh).material as Material | Material[] | undefined;
        if (!m) return;
        for (const mm of Array.isArray(m) ? m : [m]) {
          if (seen.has(mm)) continue;
          seen.add(mm);
          mm.dispose();
        }
      });
    },
    [setup],
  );

  const applied = useRef<BuildingState | null>(null);
  const litIdx = Math.max(0, POP_ORDER.indexOf(code));
  useFrame((_, dt) => {
    const a = anim.current;
    if (applied.current !== a.state) {
      applied.current = a.state;
      for (const [s, g] of setup.groups) {
        const on = s === a.state;
        g.visible = on;
        g.traverse((o) => {
          if ((o as Mesh).isMesh) (o as Mesh).raycast = on && !tintHidden(o) ? originalRaycast : noRaycast;
        });
      }
    }
    const k = a.hover;
    for (const m of setup.glow) {
      m.emissive.copy(a.color);
      m.emissiveIntensity = a.glow * (0.9 + k * 0.9) * (1 + 0.6 * env.night);
    }
    for (const m of setup.identity) {
      if (m.emissive) {
        m.emissive.copy(m.color);
        m.emissiveIntensity = k * 0.3;
      }
    }
    applyEnv(setup.envMats, litAt(litIdx));
    const inc = a.state === "incident";
    const since = a.t - a.since;
    for (const f of setup.fx) {
      switch (f.kind) {
        case "spin":
          f.pivot.rotation.y += dt * (inc ? 1.6 : 0.6);
          break;
        case "beacon":
          f.pivot.rotation.y += dt * (inc ? 6 : 3);
          f.pivot.scale.setScalar(1 + 0.1 * Math.sin(a.t * (inc ? 8 : 3)));
          break;
        case "pop":
          f.pivot.scale.y = Math.max(easeOutBack(MathUtils.clamp(since / 0.7, 0, 1)), 0.001);
          break;
        case "fill":
          f.pivot.scale[f.axis] = Math.max(a.fill, 0.001);
          break;
        case "fade": {
          const ap = MathUtils.clamp(since / 0.9, 0, 1);
          f.pivot.scale.setScalar(0.85 + 0.15 * ap);
          for (const { m, opacity } of f.mats) {
            m.transparent = true;
            m.opacity = opacity * ap;
          }
          break;
        }
        case "holo":
          f.pivot.rotation.y += dt * 0.6;
          f.pivot.position.y = f.baseY + Math.sin(a.t * 1.4) * 0.4;
          break;
      }
    }
  });

  return <primitive object={setup.root} />;
}
