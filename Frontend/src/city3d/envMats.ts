import { Color, Mesh, Vector3, type Material, type MeshStandardMaterial, type Object3D } from "three";
import { env } from "./env";

type Std = MeshStandardMaterial;
export interface EnvMats {
  windows: { m: Std; day: number }[];
  lamps: { m: Std; day: number }[];
}
const WARM = new Color("#ffb347");
const LAMP = new Color("#ffd27a");

/** Registers window / lamp materials (found by name) so they can be lit up at night. Materials must already be per-instance clones. */
export function classify(m: Material, into: EnvMats) {
  const n = m.name.toLowerCase();
  const s = m as Std;
  if (n.includes("carlight")) {
    s.toneMapped = false;
    into.lamps.push({ m: s, day: 0.6 });
  } else if (n.includes("window")) {
    if (!s.emissive || s.emissive.getHex() === 0) s.emissive = WARM.clone();
    into.windows.push({ m: s, day: 0.25 });
  } else if (n.includes("lamp")) {
    s.emissive = LAMP.clone();
    s.toneMapped = false;
    into.lamps.push({ m: s, day: 0.5 });
  }
}

export const newEnvMats = (): EnvMats => ({ windows: [], lamps: [] });

export function applyEnv(e: EnvMats) {
  const k = env.night;
  for (const w of e.windows) w.m.emissiveIntensity = w.day + k * 1.9;
  for (const l of e.lamps) l.m.emissiveIntensity = l.day + k * 3.2;
}

/** Ground positions of lamp lights found in a loaded model (clustered), for fake light pools. */
export function lampPositions(root: Object3D): [number, number][] {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { x: number; z: number; n: number }>();
  const v = new Vector3();
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!mats.some((m) => m.name.toLowerCase().includes("lamp"))) return;
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (v.y < 1.5) continue;
      const key = `${Math.round(v.x / 2.5)}_${Math.round(v.z / 2.5)}`;
      const b = buckets.get(key) ?? { x: 0, z: 0, n: 0 };
      b.x += v.x;
      b.z += v.z;
      b.n++;
      buckets.set(key, b);
    }
  });
  return [...buckets.values()].map((b) => [b.x / b.n, b.z / b.n] as [number, number]);
}
