/* global process, console */
// Offline draw-call optimiser for public/models/city/*.glb (Draco in -> Draco out). Not bundled into the app.
//
//   npm i --no-save @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions draco3dgltf
//   node src/city3d/tools/optimize-glb.mjs <srcDir-with-original-glbs> <outDir>
//
// What it does (visuals unchanged, only batching changes):
//  * Buildings B01..B08: static meshes and the static children of every state group are joined into one
//    "<name>_static" mesh with one primitive per material. Animated parts (ring/beacon/barrier/dome/progress/hologram
//    shield), state groups, hotspot and all node names of the naming contract are kept. Kit-material decor
//    (c_curb/c_lawn/lamps/benches/trees/flowers of each plot) is moved into city_base.glb (baked at the building position).
//  * city_base.glb: static parts joined per material into "city_static"; trees (incl. the plots' trees), lamps, flowers, flags and boats stay separate
//    nodes so the runtime can "grow" them in as clusters; the hidden city_vehicles mesh is dropped.
//  * city_surroundings.glb: static parts joined per material, trees joined per material, foam kept apart (transparent).
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { draco, joinPrimitives, mergeDocuments, prune, transformPrimitive } from "@gltf-transform/functions";
import draco3d from "draco3dgltf";
import { join } from "node:path";

const [, , SRC, OUT] = process.argv;
if (!SRC || !OUT) throw new Error("usage: optimize-glb.mjs <srcDir> <outDir>");
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "draco3d.decoder": await draco3d.createDecoderModule(), "draco3d.encoder": await draco3d.createEncoderModule() });

// keep in sync with layout.ts BLENDER_XY: three (x, z) = (bx, -by)
const PLACE = { B08: [0, 0], B01: [0, 36], B03: [-34, 24], B02: [34, 24], B05: [-44, -4], B06: [44, -4], B04: [-30, -32], B07: [30, -32] };
const KIND = /ring|beacon|barrier|dome|progress|hologram|shield|tint|hotspot/i; // GlbBuilding.kindOf + tint
const DETAIL_NODE = /_(plot|props|trees_leaf|trees_trunk|lamps|benches|planters_leaf)$/;
const SHARED_MAT = /^(c_|fl_|flower_)/; // kit materials shared by every plot

const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const translate = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

const usesUV = (m) => !!m && !!(m.getBaseColorTexture() || m.getNormalTexture() || m.getEmissiveTexture() || m.getMetallicRoughnessTexture() || m.getOcclusionTexture());
const semantics = (prim) => prim.listSemantics().filter((s) => !/^TEXCOORD/.test(s) || usesUV(prim.getMaterial())).sort();

/** Primitives of `nodes` (+ their world matrices), baked and joined per material (and attribute layout) into one new mesh. */
function bake(doc, nodes, name, extra = null, skipPrim = () => false) {
  const groups = new Map();
  for (const n of nodes) {
    const mesh = n.getMesh();
    if (!mesh) continue;
    let m = n.getWorldMatrix();
    if (extra) m = mul(extra, m);
    for (const prim of mesh.listPrimitives()) {
      if (skipPrim(prim)) continue;
      const mat = prim.getMaterial();
      const sig = (mat?.getName() ?? "none") + "|" + semantics(prim).join(",") + "|" + prim.getMode() + "|" + (prim.getIndices() ? "i" : "n");
      const g = groups.get(sig) ?? { mat, items: [] };
      g.items.push({ prim, m });
      groups.set(sig, g);
    }
  }
  if (!groups.size) return null;
  const out = doc.createMesh(name);
  for (const g of groups.values()) {
    const prims = g.items.map(({ prim, m }) => {
      const c = doc.createPrimitive().setMode(prim.getMode()).setMaterial(g.mat);
      for (const s of semantics(prim)) c.setAttribute(s, prim.getAttribute(s).clone());
      if (prim.getIndices()) c.setIndices(prim.getIndices().clone());
      transformPrimitive(c, m);
      return c;
    });
    out.addPrimitive(prims.length === 1 ? prims[0] : joinPrimitives(prims));
  }
  return out;
}

/** Remove the baked primitives from their source meshes (dispose the node when its mesh becomes empty). */
function drop(nodes, pred = () => true) {
  for (const n of nodes) {
    const mesh = n.getMesh();
    if (!mesh) continue;
    for (const p of mesh.listPrimitives()) if (pred(p)) mesh.removePrimitive(p);
    if (!mesh.listPrimitives().length) {
      n.setMesh(null);
      if (!n.listChildren().length) n.dispose();
    }
  }
}

const descendants = (n) => n.listChildren().flatMap((c) => [c, ...descendants(c)]);
const underKind = (n) => {
  for (let p = n; p; p = p.getParentNode()) if (KIND.test(p.getName())) return true;
  return false;
};
const check = (n) => {
  const w = n.getWorldMatrix();
  if (n.getName() && /_state_[a-z]+$|^B0\d$/.test(n.getName()) && w.some((v, i) => Math.abs(v - (i % 5 === 0 ? 1 : 0)) > 1e-5)) throw new Error("non-identity group " + n.getName());
};

async function writeDoc(doc, file) {
  const [b0, ...extra] = doc.getRoot().listBuffers();
  if (extra.length) {
    for (const a of doc.getRoot().listAccessors()) a.setBuffer(b0);
    extra.forEach((b) => b.dispose());
  }
  await doc.transform(prune({ keepLeaves: false }), draco());
  await io.write(join(OUT, file), doc);
}

// ---------- buildings (+ plot decor -> base) ----------
const base = await io.read(join(SRC, "city_base.glb"));
const bscene = base.getRoot().listScenes()[0];
for (const code of Object.keys(PLACE).sort()) {
  const file = `${code}.glb`;
  const doc = await io.read(join(SRC, file));
  const root = doc.getRoot().listNodes().find((n) => n.getName() === code);
  const all = descendants(root);
  all.forEach(check);
  const states = all.filter((n) => /_state_[a-z]+$/.test(n.getName()));
  const top = root.listChildren().filter((n) => !states.includes(n) && !/_hotspot$/.test(n.getName()));

  // 1) plot decor (kit materials only) -> base, baked at the building position
  const [bx, by] = PLACE[code];
  const decorNodes = top.filter((n) => DETAIL_NODE.test(n.getName()));
  const isDecorPrim = (p) => SHARED_MAT.test(p.getMaterial()?.getName() ?? "");
  const treeSel = decorNodes.filter((n) => /_trees_/.test(n.getName()));
  const otherSel = decorNodes.filter((n) => !/_trees_/.test(n.getName()));
  const holders = [];
  for (const [suffix, sel] of [["decor_trees", treeSel], ["decor", otherSel]]) {
    const mesh = bake(doc, sel, `${code}_${suffix}`, translate(bx, 0, -by), (p) => !isDecorPrim(p));
    if (mesh) holders.push(doc.createNode(`${code}_${suffix}`).setMesh(mesh));
  }
  if (holders.length) {
    holders.forEach((h) => root.addChild(h));
    const map = mergeDocuments(base, doc); // copies the document into the base; only the holders are kept there
    const mroot = map.get(root);
    const mh = holders.map((h) => map.get(h));
    mh.forEach((n) => bscene.addChild(n));
    for (const n of [mroot, ...descendants(mroot)]) if (!mh.includes(n)) n.dispose();
    holders.forEach((h) => h.dispose());
  }
  drop(decorNodes, isDecorPrim);

  // 2) everything else static in the building root -> one mesh
  const rest = top.filter((n) => n.getMesh() && !KIND.test(n.getName()));
  const sm = bake(doc, rest, `${code}_static`);
  drop(rest);
  if (sm) root.addChild(doc.createNode(`${code}_static`).setMesh(sm));

  // 3) static children of each state group (animated keyword parts stay separate nodes)
  for (const s of states) {
    const kids = descendants(s).filter((n) => n.getMesh() && !underKind(n));
    const m = bake(doc, kids, `${s.getName()}_static`);
    drop(kids);
    if (m) s.addChild(doc.createNode(`${s.getName()}_static`).setMesh(m));
  }
  await writeDoc(doc, file);
}
for (const sc of base.getRoot().listScenes().slice(1)) sc.dispose();

// unify same-named materials (kit materials are identical across files)
const byName = new Map();
for (const m of base.getRoot().listMaterials()) {
  const first = byName.get(m.getName());
  if (!first) byName.set(m.getName(), m);
  else {
    const same = JSON.stringify([first.getBaseColorFactor(), first.getEmissiveFactor(), first.getRoughnessFactor(), first.getMetallicFactor(), first.getAlphaMode()]) ===
      JSON.stringify([m.getBaseColorFactor(), m.getEmissiveFactor(), m.getRoughnessFactor(), m.getMetallicFactor(), m.getAlphaMode()]);
    if (!same) console.warn("material differs, not unified:", m.getName());
    else for (const mesh of base.getRoot().listMeshes()) for (const p of mesh.listPrimitives()) if (p.getMaterial() === m) p.setMaterial(first);
  }
}

const KEEP_SEP = /lamps|flowers|flags|city_water$|water_detail|arrows/i;
const nodesNow = [...bscene.listChildren()];
const isTree = (n) => /trees_leaf$|trees_trunk$|decor_trees$/.test(n.getName());
const isLamps = (n) => /city_lamps$/.test(n.getName());
const sepNodes = nodesNow.filter((n) => KEEP_SEP.test(n.getName()) && !isTree(n) && !isLamps(n));
nodesNow.filter((n) => /vehicles/.test(n.getName())).forEach((n) => n.dispose()); // hidden at runtime anyway
const trees = nodesNow.filter((n) => !n.isDisposed() && isTree(n));
const staticNodes = nodesNow.filter((n) => !n.isDisposed() && n.getMesh() && !sepNodes.includes(n) && !trees.includes(n) && !isLamps(n));
const treeMesh = bake(base, trees, "city_trees");
const staticMesh = bake(base, staticNodes, "city_static");
trees.forEach((n) => n.dispose());
staticNodes.forEach((n) => n.dispose());
bscene.addChild(base.createNode("city_trees").setMesh(treeMesh));
bscene.addChild(base.createNode("city_static").setMesh(staticMesh));
await writeDoc(base, "city_base.glb");

// ---------- surroundings ----------
const sur = await io.read(join(SRC, "city_surroundings.glb"));
const sscene = sur.getRoot().listScenes()[0];
const sn = sscene.listChildren();
const foam = sn.filter((n) => /foam/.test(n.getName()));
const sTrees = sn.filter((n) => /leaves|trunks/.test(n.getName()));
const sStatic = sn.filter((n) => !foam.includes(n) && !sTrees.includes(n) && n.getMesh());
const mt = bake(sur, sTrees, "city_surr_trees");
const ms = bake(sur, sStatic, "city_surr_static");
[...sTrees, ...sStatic].forEach((n) => n.dispose());
sscene.addChild(sur.createNode("city_surr_trees").setMesh(mt));
sscene.addChild(sur.createNode("city_surr_static").setMesh(ms));
await writeDoc(sur, "city_surroundings.glb");
console.log("done");
