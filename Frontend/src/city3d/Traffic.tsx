import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, Color, CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute, Matrix4, MathUtils, Object3D, Shape, type InstancedMesh, type MeshBasicMaterial } from "three";
import { toCreasedNormals } from "three-stdlib";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { lifeAt } from "./assembly";
import { env } from "./env";
import { noRaycast } from "./fx";

interface Lane { a: [number, number]; b: [number, number]; dir: 1 | -1; color: string; speed: number }
// 6 cars on 6 different street stretches (right-hand lanes). They never share a lane, never enter the plaza roundabout or a building plot.
const LANES: Lane[] = [
  { a: [-21, -44], b: [-21, 50], dir: 1, color: "#ef5350", speed: 4.4 },
  { a: [21, -44], b: [21, 50], dir: -1, color: "#ffca28", speed: 3.8 },
  { a: [-60, -9.5], b: [-26, -9.5], dir: 1, color: "#42a5f5", speed: 4.0 },
  { a: [26, 17.5], b: [60, 17.5], dir: 1, color: "#ffffff", speed: 3.6 },
  { a: [-60, 17.5], b: [-26, 17.5], dir: -1, color: "#ab47bc", speed: 4.2 },
  { a: [0, 22], b: [0, 54], dir: 1, color: "#ff8a3d", speed: 3.4 },
];

/** Same construction as drei's <RoundedBox> (extruded rounded rectangle, creased normals), as a plain geometry. */
function roundedBox(w: number, h: number, d: number, radius: number, smoothness: number): BufferGeometry {
  const eps = 0.00001;
  const r = radius - eps;
  const shape = new Shape();
  shape.absarc(eps, eps, eps, -Math.PI / 2, -Math.PI, true);
  shape.absarc(eps, h - r * 2, eps, Math.PI, Math.PI / 2, true);
  shape.absarc(w - r * 2, h - r * 2, eps, Math.PI / 2, 0, true);
  shape.absarc(w - r * 2, eps, eps, 0, -Math.PI / 2, true);
  const g = new ExtrudeGeometry(shape, { depth: d - radius * 2, bevelEnabled: true, bevelSegments: 8, steps: 1, bevelSize: radius - eps, bevelThickness: radius, curveSegments: smoothness });
  g.center();
  return toCreasedNormals(g, 0.4);
}

function part(g: BufferGeometry, pos: [number, number, number], color: string, rotZ = 0): BufferGeometry {
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute("uv");
  if (rotZ) out.rotateZ(rotZ);
  out.translate(...pos);
  const c = new Color(color);
  const n = out.attributes.position.count;
  out.setAttribute("color", new Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
  return out;
}

/** All six cars share three geometries: tinted paint (per-instance colour), fixed dark/glass parts, and head/tail lights. */
function buildCarGeometry() {
  const white = "#ffffff";
  // body + cabin + roof cap (front = +Z)
  const paint = mergeGeometries([part(roundedBox(2, 0.9, 4.2, 0.35, 3), [0, 0.95, 0], white), part(roundedBox(1.76, 0.18, 2.3, 0.08, 2), [0, 2.08, -0.2], white)])!;
  const fixed = mergeGeometries([
    part(roundedBox(1.7, 0.8, 2.2, 0.32, 3), [0, 1.65, -0.2], "#dff1ff"),
    ...[[-1.02, 1.3], [1.02, 1.3], [-1.02, -1.3], [1.02, -1.3]].map(([x, z]) => part(new CylinderGeometry(0.46, 0.46, 0.34, 14), [x, 0.45, z], "#26263a", Math.PI / 2)),
  ])!;
  const box = (w: number, h: number, d: number) => new ExtrudeGeometry(new Shape().moveTo(-w / 2, -h / 2).lineTo(w / 2, -h / 2).lineTo(w / 2, h / 2).lineTo(-w / 2, h / 2).closePath(), { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
  const lights = mergeGeometries([
    ...[-0.6, 0.6].map((x) => part(box(0.42, 0.28, 0.1), [x, 1.05, 2.12], "#fff6cf")),
    ...[-0.6, 0.6].map((x) => part(box(0.42, 0.24, 0.1), [x, 1.05, -2.12], "#ff4a4a")),
  ])!;
  return { paint, fixed, lights };
}

/** Six cartoon cars looping on fixed street lanes: 3 instanced draw calls in total. Lights glow at night. */
export default function Traffic() {
  const geo = useMemo(buildCarGeometry, []);
  const paint = useRef<InstancedMesh>(null);
  const fixed = useRef<InstancedMesh>(null);
  const lights = useRef<InstancedMesh>(null);
  const lightMat = useRef<MeshBasicMaterial>(null);
  const u = useRef(LANES.map((_, i) => (i * 0.31) % 1));
  const o = useMemo(() => new Object3D(), []);
  const m4 = useMemo(() => new Matrix4(), []);

  useLayoutEffect(() => {
    LANES.forEach((l, i) => paint.current?.setColorAt(i, new Color(l.color)));
    if (paint.current?.instanceColor) paint.current.instanceColor.needsUpdate = true;
  }, []);

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const life = lifeAt();
    const all = [paint.current, fixed.current, lights.current];
    for (const m of all) if (m) m.visible = life > 0;
    if (life <= 0) return;
    LANES.forEach((l, i) => {
      const dx = l.b[0] - l.a[0];
      const dz = l.b[1] - l.a[1];
      const len = Math.hypot(dx, dz);
      u.current[i] = (u.current[i] + (l.speed * Math.min(dt, 0.05)) / len) % 1;
      const uu = l.dir === 1 ? u.current[i] : 1 - u.current[i];
      const hx = (dx / len) * l.dir;
      const hz = (dz / len) * l.dir;
      const off = 1.6; // right-hand lane
      o.position.set(l.a[0] + dx * uu - hz * off, 0.12 + Math.sin(t * 6 + i) * 0.025, l.a[1] + dz * uu + hx * off);
      o.rotation.set(0, Math.atan2(hx, hz), 0);
      const edge = Math.min(u.current[i], 1 - u.current[i]) * len;
      o.scale.setScalar(MathUtils.clamp(edge / 3, 0.0001, 1) * life);
      o.updateMatrix();
      m4.copy(o.matrix);
      for (const m of all) m?.setMatrixAt(i, m4);
    });
    for (const m of all) if (m) m.instanceMatrix.needsUpdate = true;
    if (lightMat.current) lightMat.current.color.setScalar(0.9 + env.night * 2.6);
  });

  return (
    <group>
      <instancedMesh ref={paint} args={[geo.paint, undefined, LANES.length]} frustumCulled={false} raycast={noRaycast}>
        <meshStandardMaterial color="#ffffff" roughness={0.45} />
      </instancedMesh>
      <instancedMesh ref={fixed} args={[geo.fixed, undefined, LANES.length]} frustumCulled={false} raycast={noRaycast}>
        <meshStandardMaterial vertexColors roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={lights} args={[geo.lights, undefined, LANES.length]} frustumCulled={false} raycast={noRaycast}>
        <meshBasicMaterial ref={lightMat} vertexColors toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
