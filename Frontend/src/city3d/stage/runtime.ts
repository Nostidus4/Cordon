import { MathUtils, Vector3 } from "three";
import type { GraphSnapshot } from "../../types/graph";
import type { Tone } from "../../stage/contract";
import { BARGE, CLUSTER, DEFAULT_CLUSTER, KEY_HOME, MEMBER_POS, MOCKDEX, TREASURY, BUILDING_XZ, houseSpot, type V2 } from "./world";
import type { PinKind } from "./icons";

export interface Amt { red: number; redT: number; hl: number; hlT: number; tone: Tone }
export interface PinRT {
  id: string; label: string; kind: PinKind; principalId?: string;
  pos: Vector3; target: Vector3; sink: number; sinkT: number; moving: number;
}
export interface FenceRT {
  id: string; principalId: string; label: string; kind: PinKind; cap: string | null; capRaw: string | null; spentRaw: string | null;
  locked: boolean; lock: number; alpha: number; alphaT: number;
  cx: number; cz: number; hx: number; hz: number; slot: number; nPins: number; seen: boolean;
}
export interface ArcDef { id: string; a: string; b: string; style: "declared" | "inferred" | "other" }

const PIN_H = 4.2;
const FENCE_PAD = 5.5;
const MIN_HALF = 6;

export class StageRuntime {
  pins = new Map<string, PinRT>();
  fences = new Map<string, FenceRT>();
  amts = new Map<string, Amt>();
  houses: string[] = [];
  arcs: ArcDef[] = [];
  gateFlash = 0;
  private nextSlot = 0;
  private tmp = new Vector3();

  amt(id: string): Amt {
    let a = this.amts.get(id);
    if (!a) {
      a = { red: 0, redT: 0, hl: 0, hlT: 0, tone: "amber" };
      this.amts.set(id, a);
    }
    return a;
  }

  /** Recompute layout targets + flags from props (called when props change). Returns true when the arc list changed. */
  sync(graph: GraphSnapshot | undefined, opts: {
    reachedNodes: Set<string>; reachedEdges: Set<string>; hlNodes: Set<string>; hlEdges: Set<string>; tone: Tone; locked: Set<string>;
  }): boolean {
    for (const a of this.amts.values()) { a.redT = 0; a.hlT = 0; }
    for (const id of opts.reachedNodes) this.amt(id).redT = 1;
    for (const id of opts.reachedEdges) this.amt(id).redT = 1;
    for (const id of opts.hlNodes) { const a = this.amt(id); a.hlT = 1; a.tone = opts.tone; }
    for (const id of opts.hlEdges) { const a = this.amt(id); a.hlT = 1; a.tone = opts.tone; }

    const seenPins = new Set<string>();
    const seenFences = new Set<string>();
    const recipients: string[] = [];
    if (graph) {
      const keysByPrincipal = new Map<string, string[]>();
      for (const n of graph.nodes) {
        if (n.type === "Key" && n.data.principalId) {
          const arr = keysByPrincipal.get(n.data.principalId) ?? [];
          arr.push(n.id);
          keysByPrincipal.set(n.data.principalId, arr);
        }
        if (n.type === "Recipient") recipients.push(n.id.slice(2));
      }
      for (const n of graph.nodes) {
        if (n.type !== "Key") continue;
        const pid = n.data.principalId;
        const keyId = n.id.slice(2);
        const siblings = pid ? keysByPrincipal.get(pid) ?? [] : [n.id];
        let xz: V2;
        if (siblings.length <= 1) xz = KEY_HOME[keyId] ?? DEFAULT_CLUSTER;
        else {
          const c = (pid && CLUSTER[pid]) || DEFAULT_CLUSTER;
          const idx = siblings.indexOf(n.id);
          const ang = (idx / siblings.length) * Math.PI * 2 - Math.PI / 2;
          const r = siblings.length > 2 ? 9 : 4.5;
          xz = [c[0] + Math.cos(ang) * r, c[1] + Math.sin(ang) * r * 0.85];
        }
        let p = this.pins.get(n.id);
        if (!p) {
          p = { id: n.id, label: n.label, kind: (n.data.kind as PinKind) ?? "HUMAN", principalId: pid,
            pos: new Vector3(xz[0], PIN_H, xz[1]), target: new Vector3(xz[0], PIN_H, xz[1]), sink: 0, sinkT: 0, moving: 0 };
          this.pins.set(n.id, p);
        }
        p.label = n.label;
        p.kind = (n.data.kind as PinKind) ?? p.kind;
        p.principalId = pid;
        p.target.set(xz[0], PIN_H, xz[1]);
        p.sinkT = pid && opts.locked.has(pid) ? 1 : 0;
        seenPins.add(n.id);
      }
      for (const n of graph.nodes) {
        if (n.type !== "Member") continue;
        const xz = MEMBER_POS[n.id] ?? [0, -22];
        let p = this.pins.get(n.id);
        if (!p) {
          p = { id: n.id, label: n.label, kind: "MEMBER", pos: new Vector3(xz[0], 4.6, xz[1]), target: new Vector3(xz[0], 4.6, xz[1]), sink: 0, sinkT: 0, moving: 0 };
          this.pins.set(n.id, p);
        }
        p.label = n.label;
        seenPins.add(n.id);
      }
      for (const d of graph.districts) {
        const pn = graph.nodes.find((n) => n.id === `p:${d.principalId}`);
        let f = this.fences.get(d.principalId);
        if (!f) {
          f = { id: `p:${d.principalId}`, principalId: d.principalId, label: d.label, kind: d.kind, cap: null, capRaw: null, spentRaw: null, locked: false, lock: 0,
            alpha: 0, alphaT: 1, cx: 0, cz: 0, hx: MIN_HALF, hz: MIN_HALF, slot: this.nextSlot++, nPins: 0, seen: false };
          this.fences.set(d.principalId, f);
        }
        f.label = d.label;
        f.kind = d.kind;
        f.cap = d.dailyCap ? d.dailyCap.display : null;
        f.capRaw = d.dailyCap ? d.dailyCap.raw : null;
        f.spentRaw = d.spentToday.raw;
        f.locked = opts.locked.has(d.principalId) || d.locked || pn?.data.locked === true;
        f.alphaT = 1;
        seenFences.add(d.principalId);
      }
    }
    for (const [id, p] of this.pins) if (!seenPins.has(id)) this.pins.delete(id), void p;
    for (const [id, f] of this.fences) if (!seenFences.has(id)) f.alphaT = 0, (f.seen = true), void id;
    this.houses = [...new Set([...recipients, "stranger_wallet"])];

    const arcs: ArcDef[] = [];
    if (graph) {
      for (const e of graph.edges) {
        const hit = opts.reachedEdges.has(e.id) || opts.hlEdges.has(e.id);
        if (e.type === "CONTROLS" || e.type === "ADMINS") arcs.push({ id: e.id, a: e.from, b: e.to, style: e.source === "inferred" ? "inferred" : "declared" });
        else if (hit && e.type !== "HOLDS_KEY") arcs.push({ id: e.id, a: e.from, b: e.to, style: "other" });
      }
    }
    const changed = arcs.length !== this.arcs.length || arcs.some((a, i) => a.id !== this.arcs[i].id || a.style !== this.arcs[i].style);
    if (changed) this.arcs = arcs;
    return changed;
  }

  tick(dt: number, t: number) {
    const k = 1 - Math.exp(-3.2 * dt);
    for (const p of this.pins.values()) {
      const dx = p.target.x - p.pos.x;
      const dz = p.target.z - p.pos.z;
      const dist = Math.hypot(dx, dz);
      p.pos.x += dx * k;
      p.pos.z += dz * k;
      // fly in an arc: lift grows with the remaining distance
      const lift = Math.min(dist * 0.28, 14);
      p.moving = MathUtils.damp(p.moving, dist > 0.4 ? 1 : 0, 6, dt);
      p.sink = MathUtils.damp(p.sink, p.sinkT, 4, dt);
      const bob = Math.sin(t * 1.6 + p.pos.x * 0.3) * 0.25 * (1 - p.sink);
      p.pos.y = p.target.y + lift + bob - p.sink * 2.2;
    }
    const lk = 1 - Math.exp(-8 * dt);
    for (const a of this.amts.values()) {
      a.red += (a.redT - a.red) * (1 - Math.exp(-9 * dt));
      a.hl += (a.hlT - a.hl) * lk;
    }
    for (const f of this.fences.values()) {
      const mine = [...this.pins.values()].filter((p) => p.principalId === f.principalId);
      f.nPins = mine.length;
      if (mine.length && f.alphaT > 0) {
        let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
        for (const p of mine) { x0 = Math.min(x0, p.pos.x); x1 = Math.max(x1, p.pos.x); z0 = Math.min(z0, p.pos.z); z1 = Math.max(z1, p.pos.z); }
        const tcx = (x0 + x1) / 2, tcz = (z0 + z1) / 2;
        const thx = Math.max(MIN_HALF, (x1 - x0) / 2 + FENCE_PAD), thz = Math.max(MIN_HALF, (z1 - z0) / 2 + FENCE_PAD);
        if (f.alpha < 0.02) { f.cx = tcx; f.cz = tcz; f.hx = thx; f.hz = thz; }
        const kk = 1 - Math.exp(-6 * dt);
        f.cx += (tcx - f.cx) * kk; f.cz += (tcz - f.cz) * kk; f.hx += (thx - f.hx) * kk; f.hz += (thz - f.hz) * kk;
      }
      f.alpha += (f.alphaT - f.alpha) * (1 - Math.exp(-4 * dt));
      f.lock += ((f.locked ? 1 : 0) - f.lock) * (1 - Math.exp(-5 * dt));
    }
    this.gateFlash = Math.max(0, this.gateFlash - dt * 0.9);
  }

  /** Where `id` is in the world (arc endpoints, packet targets). */
  nodePos(id: string, out: Vector3): Vector3 {
    if (id.startsWith("k:") || id.startsWith("m:")) {
      const p = this.pins.get(id);
      if (p) return out.copy(p.pos);
    }
    if (id.startsWith("p:")) {
      const f = this.fences.get(id.slice(2));
      if (f) return out.set(f.cx, 1.2, f.cz);
    }
    if (id.startsWith("r:")) {
      const [x, z] = houseSpot(id.slice(2), 0);
      return out.set(x, 4, z);
    }
    if (id === "treasury") return out.set(TREASURY[0], 8, TREASURY[1]);
    if (id === "vault") return out.set(BUILDING_XZ.B03[0], 14, BUILDING_XZ.B03[1]);
    if (id === "council") return out.set(BUILDING_XZ.B01[0], 12, BUILDING_XZ.B01[1]);
    if (id.startsWith("pr:")) return id.toLowerCase().includes("evil") ? out.set(BARGE[0], 4, BARGE[1]) : out.set(MOCKDEX[0], 5, MOCKDEX[1]);
    return out.set(0, 2, 0);
  }
  scratch() { return this.tmp; }
}
