import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, Html, Line } from "@react-three/drei";
import { Color, MathUtils, Object3D, Vector3, type InstancedMesh, type Mesh, type MeshBasicMaterial } from "three";
import type { Attempt } from "../../types/attempt";
import { badgeTexture, noRaycast } from "../fx";
import { useRT } from "./context";
import { BARGE, MOCKDEX, houseSpot } from "./world";

const MAX = 12;
const TEAL = "#2dd4bf";
const RED = "#ff2d3d";
const GREY = "#aab2c8";
type Out = "ok" | "reverted" | "blocked_at_protocol";
const COLOR: Record<Out, string> = { ok: TEAL, reverted: RED, blocked_at_protocol: GREY };

interface Pk {
  id: string; outcome: Out; t0: number; start: Vector3; end: Vector3; hit: Vector3; kind: string; fenced: boolean;
  done: boolean; burstAt: number; billboardSlot: number;
}
interface Trail { id: string; pts: [number, number, number][]; color: string }
interface Puff { id: string; pos: [number, number, number]; until: number }

const FWD = 1.15;
const BACK = 0.8;

function arcPoint(a: Vector3, b: Vector3, u: number, out: Vector3) {
  const lift = 4 + a.distanceTo(b) * 0.28;
  return out.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + Math.sin(u * Math.PI) * lift, a.z + (b.z - a.z) * u);
}

/** Packets (coins) flying key pin → target. ok: teal burst; reverted: bounce off the district fence with red flash + ✕; blocked: fizzle at the pin. */
export default function Packets({ attempts }: { attempts: Attempt[] | undefined }) {
  const rt = useRT();
  const coins = useRef<InstancedMesh>(null);
  const bursts = useRef<(Mesh | null)[]>([]);
  const burstMats = useRef<(MeshBasicMaterial | null)[]>([]);
  const crosses = useRef<(Mesh | null)[]>([]);
  const active = useRef<Pk[]>([]);
  const burstState = useRef<{ t: number; pos: Vector3; color: string }[]>(Array.from({ length: 10 }, () => ({ t: -9, pos: new Vector3(), color: TEAL })));
  const seen = useRef(new Set<string>());
  const [trails, setTrails] = useState<Trail[]>([]);
  const [puffs, setPuffs] = useState<Puff[]>([]);
  const o = useMemo(() => new Object3D(), []);
  const tmp = useMemo(() => new Vector3(), []);
  const crossTex = useMemo(() => badgeTexture("incident"), []);
  const queue = useRef<{ at: number; pk: Pk }[]>([]);

  useEffect(() => {
    if (!attempts) return;
    const fresh = attempts.filter((a) => !seen.current.has(a.id));
    if (fresh.length === 0) return;
    const nowT = performance.now() / 1000;
    const newTrails: Trail[] = [];
    fresh.slice(-MAX).forEach((a, i) => {
      seen.current.add(a.id);
      const pin = rt.pins.get(`k:${a.signer}`);
      if (!pin || a.action.kind === "lock") return;
      const start = pin.pos.clone();
      let end = new Vector3(0, 3, 0);
      let kind = "pay";
      if (a.action.dex) {
        kind = "swap";
        end = /evil/i.test(a.action.dex) ? new Vector3(BARGE[0], 4, BARGE[1]) : new Vector3(MOCKDEX[0], 5, MOCKDEX[1]);
      } else if (a.action.to) {
        const [x, z] = houseSpot(a.action.to, 0);
        end = new Vector3(x, 4, z);
      } else end = start.clone().add(new Vector3(8, 0, 6));
      // exit point of the straight path from the pin through its district fence
      const f = pin.principalId ? rt.fences.get(pin.principalId) : undefined;
      const hit = start.clone();
      if (f) {
        const dx = end.x - start.x, dz = end.z - start.z;
        let tmin = 1;
        for (const [lim, d, s] of [[f.cx + f.hx, dx, start.x], [f.cx - f.hx, dx, start.x], [f.cz + f.hz, dz, start.z], [f.cz - f.hz, dz, start.z]] as [number, number, number][]) {
          if (Math.abs(d) > 1e-6) {
            const t = (lim - s) / d;
            if (t > 0.001 && t < tmin) tmin = t;
          }
        }
        hit.set(start.x + dx * tmin, 3.2, start.z + dz * tmin);
        if (tmin >= 0.999) hit.copy(start).lerp(end, 0.35);
      } else hit.copy(start).lerp(end, 0.4);
      const pk: Pk = { id: a.id, outcome: a.outcome, t0: 0, start, end, hit, kind, fenced: !!f?.cap, done: false, burstAt: -1, billboardSlot: -1 };
      queue.current.push({ at: nowT + i * 0.45, pk });
      const pts: [number, number, number][] = [];
      const target = a.outcome === "reverted" ? hit : a.outcome === "blocked_at_protocol" ? start.clone().lerp(end, 0.12) : end;
      for (let s = 0; s <= 24; s++) {
        arcPoint(start, target, s / 24, tmp);
        pts.push([tmp.x, tmp.y, tmp.z]);
      }
      newTrails.push({ id: a.id, pts, color: COLOR[a.outcome] });
    });
    if (newTrails.length) setTrails((t) => [...t, ...newTrails].slice(-8));
  }, [attempts, rt, tmp]);

  const spawnBurst = (pos: Vector3, color: string, t: number) => {
    const b = burstState.current.reduce((m, x) => (x.t < m.t ? x : m));
    b.t = t;
    b.pos.copy(pos);
    b.color = color;
  };

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const nowT = performance.now() / 1000;
    for (let i = queue.current.length - 1; i >= 0; i--) {
      if (queue.current[i].at <= nowT) {
        const pk = queue.current[i].pk;
        pk.t0 = t;
        active.current.push(pk);
        queue.current.splice(i, 1);
      }
    }
    const m = coins.current;
    let n = 0;
    for (const pk of active.current) {
      const e = t - pk.t0;
      const pos = tmp;
      let scale = 1;
      let spin = e * 9;
      if (pk.outcome === "ok") {
        const u = MathUtils.clamp(e / (FWD + 0.4), 0, 1);
        arcPoint(pk.start, pk.end, u, pos);
        if (u >= 1 && !pk.done) {
          pk.done = true;
          spawnBurst(pk.end, TEAL, t);
        }
        scale = u >= 1 ? Math.max(0, 1 - (e - FWD - 0.4) * 6) : 1;
      } else if (pk.outcome === "reverted") {
        if (e < FWD) {
          arcPoint(pk.start, pk.hit, MathUtils.clamp(e / FWD, 0, 1), pos);
        } else {
          if (!pk.done) {
            pk.done = true;
            spawnBurst(pk.hit, RED, t);
            if (pk.fenced) rt.gateFlash = 1;
            pk.billboardSlot = (Math.random() * 4) | 0;
            const slot = crosses.current[pk.billboardSlot];
            if (slot) slot.userData.t0 = t;
            lastHit.set(pk.billboardSlot, pk.hit.clone().setY(9));
          }
          const u = MathUtils.clamp((e - FWD) / BACK, 0, 1);
          // bounce back along the incoming direction, damped
          pos.set(pk.hit.x + (pk.start.x - pk.hit.x) * 0.25 * u, pk.hit.y + Math.abs(Math.sin(u * Math.PI * 2)) * 3 * (1 - u), pk.hit.z + (pk.start.z - pk.hit.z) * 0.25 * u);
          scale = 1 - u * 0.9;
          spin = e * 14;
        }
      } else {
        const u = MathUtils.clamp(e / 0.7, 0, 1);
        arcPoint(pk.start, pk.start.clone().lerp(pk.end, 0.12), u, pos);
        if (u >= 1 && !pk.done) {
          pk.done = true;
          spawnBurst(pos, GREY, t);
          setPuffs((p) => [...p, { id: pk.id, pos: [pk.start.x, pk.start.y + 3, pk.start.z], until: performance.now() + 4200 }]);
        }
        scale = u >= 1 ? 0 : 1 - u * 0.4;
      }
      if (n < MAX && m) {
        o.position.copy(pos);
        o.rotation.set(Math.PI / 2, spin, 0);
        o.scale.setScalar(Math.max(0.0001, scale));
        o.updateMatrix();
        m.setMatrixAt(n, o.matrix);
        const c = pk.outcome === "ok" ? TEAL : pk.outcome === "reverted" ? "#ffd27a" : GREY;
        m.setColorAt(n, tmpColor.set(c).multiplyScalar(2));
        n++;
      }
    }
    active.current = active.current.filter((pk) => t - pk.t0 < 4);
    if (m) {
      for (let i = n; i < MAX; i++) {
        o.scale.setScalar(0.0001);
        o.updateMatrix();
        m.setMatrixAt(i, o.matrix);
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    burstState.current.forEach((b, i) => {
      const mesh = bursts.current[i];
      const mat = burstMats.current[i];
      if (!mesh || !mat) return;
      const u = (t - b.t) / 0.9;
      mesh.visible = u >= 0 && u < 1;
      if (!mesh.visible) return;
      mesh.position.copy(b.pos);
      mesh.scale.setScalar(1 + u * 6);
      mat.color.set(b.color).multiplyScalar(2);
      mat.opacity = (1 - u) * 0.9;
    });
    crosses.current.forEach((c) => {
      if (!c) return;
      const u = (t - (c.userData.t0 ?? -9)) / 3.4;
      c.visible = u >= 0 && u < 1;
      if (c.visible) {
        c.scale.setScalar(Math.min(1, u * 6) * 1.1);
        (c.material as MeshBasicMaterial).opacity = 1 - Math.max(0, (u - 0.6) / 0.4);
      }
    });
    if (import.meta.env.DEV) (window as unknown as { __cross?: unknown }).__cross = crosses.current.map((c) => c && [c.visible, +c.scale.x.toFixed(2), +(c.material as MeshBasicMaterial).opacity.toFixed(2), c.parent?.parent?.parent?.position.toArray().map((n) => +n.toFixed(1))]);
    if (puffs.length) setPuffs((p) => (p.some((x) => x.until < performance.now()) ? p.filter((x) => x.until >= performance.now()) : p));
  });

  const hitPositions = useRef<Record<number, Vector3>>({});
  void hitPositions;

  return (
    <group>
      <instancedMesh ref={coins} args={[undefined, undefined, MAX]} frustumCulled={false} raycast={noRaycast}>
        <cylinderGeometry args={[0.8, 0.8, 0.25, 16]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {burstState.current.map((_, i) => (
        <mesh key={i} ref={(r) => { bursts.current[i] = r; }} rotation={[-Math.PI / 2, 0, 0]} visible={false} raycast={noRaycast}>
          <ringGeometry args={[0.8, 1.1, 32]} />
          <meshBasicMaterial ref={(r) => { burstMats.current[i] = r; }} transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <CrossBillboards crosses={crosses} tex={crossTex} getPos={() => active.current} />
      {trails.map((tr) => (
        <Line key={tr.id} points={tr.pts} color={new Color(tr.color).multiplyScalar(1.4)} lineWidth={1.4} transparent opacity={0.22} toneMapped={false} raycast={() => null} />
      ))}
      {puffs.map((p) => (
        <Html key={p.id} position={p.pos} center zIndexRange={[26, 0]} style={{ pointerEvents: "none" }}>
          <span className="inline-flex select-none items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-[2px] text-[13px] font-semibold" style={{ background: "#eceaf4", color: "#2B2350", borderBottom: "3px solid #bdb8d6", fontFamily: '"Baloo 2","Be Vietnam Pro",sans-serif' }}>
            <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-500 text-[10px] font-extrabold text-white">✕</span> bị chain từ chối
          </span>
        </Html>
      ))}
    </group>
  );
}

const tmpColor = new Color();

/** Four small ✕ billboards that appear at the bounce point of reverted packets. */
function CrossBillboards({ crosses, tex }: { crosses: React.MutableRefObject<(Mesh | null)[]>; tex: ReturnType<typeof badgeTexture>; getPos: () => Pk[] }) {
  const rt = useRT();
  const groups = useRef<(Object3D | null)[]>([]);
  useFrame(() => {
    // park each billboard on the fence edge nearest to the last reverted hit (cheap: follow active reverted packets by index)
    crosses.current.forEach((c, i) => {
      const g = groups.current[i];
      if (!c || !g || !c.visible || c.userData.placed === c.userData.t0) return;
      c.userData.placed = c.userData.t0;
      const hit = lastHit.get(i);
      if (hit) g.position.copy(hit);
      else g.position.set(0, 6, 0);
    });
    void rt;
  });
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <group key={i} ref={(r) => { groups.current[i] = r; }}>
          <Billboard>
            <mesh ref={(r) => { crosses.current[i] = r; if (r) r.userData.slot = i; }} visible={false} raycast={noRaycast}>
              <planeGeometry args={[7.5, 7.5]} />
              <meshBasicMaterial map={tex} transparent depthTest={false} toneMapped={false} />
            </mesh>
          </Billboard>
        </group>
      ))}
    </>
  );
}
const lastHit = new Map<number, Vector3>();
