// Fixed, precomputed layout of the permission graph (spec §10.2). Pure and deterministic: no force simulation, no randomness,
// independent of the order nodes arrive in. Treasury top · Vault + Council middle · districts as group boxes at the bottom
// (keys positioned absolutely inside them so a key can fly from one district to another when policy changes) · optional market band.
import type { GraphSnapshot } from "../types";

export type LayoutMode = "map" | "simulate";
export interface Box { x: number; y: number; w: number; h: number }
export interface GraphLayout {
  boxes: Record<string, Box>;
  bounds: Box;
  /** district node ids (`p:<id>`) in display order */
  districtIds: string[];
  /** string that changes iff any box changes: drives re-layout animation and re-fit */
  signature: string;
}

export const DIM = {
  keyW: 162, keyH: 60, keyGap: 10, pad: 12, headerH: 118, districtGap: 16, railX: 8,
  bigW: 264, bigH: 78, memberW: 156, memberH: 46, councilW: 224, marketW: 176, marketH: 48, marketGap: 14,
} as const;

/** Display order of the 7 seed principals (spec §4.2); unknown principals follow, sorted by id. */
const CANONICAL = ["minh", "agent_data", "agent_intl_pay", "agent_rebalance", "svc_payment", "huy", "lan"];
const rank = (id: string) => { const i = CANONICAL.indexOf(id); return i === -1 ? CANONICAL.length : i; };

export const districtCols = (nKeys: number) => (nKeys > 3 ? 2 : 1);
export const headerHeight = (mode: LayoutMode) => (mode === "simulate" ? 86 : DIM.headerH);
export function districtSize(nKeys: number, headerH: number = DIM.headerH): { w: number; h: number; cols: number; rows: number } {
  const cols = districtCols(nKeys), rows = Math.max(1, Math.ceil(nKeys / cols));
  const w = cols * DIM.keyW + (cols - 1) * DIM.keyGap + 2 * DIM.pad;
  const h = headerH + rows * DIM.keyH + (rows - 1) * DIM.keyGap + DIM.pad + 6;
  return { w, h, cols, rows };
}

const round = (n: number) => Math.round(n * 100) / 100;

export function computeLayout(snap: GraphSnapshot, opts: { mode?: LayoutMode; showMarket?: boolean } = {}): GraphLayout {
  const mode = opts.mode ?? "map";
  const showMarket = mode === "map" && !!opts.showMarket;
  const boxes: Record<string, Box> = {};
  const has = (id: string) => snap.nodes.some((n) => n.id === id);

  // ---- districts row
  const districts = [...snap.districts].sort((a, b) => rank(a.principalId) - rank(b.principalId) || a.principalId.localeCompare(b.principalId));
  const headerH = headerHeight(mode);
  const sizes = districts.map((d) => districtSize(d.keys.length, headerH));
  const gap = mode === "simulate" ? 12 : DIM.districtGap;
  const rowW = sizes.reduce((s, z) => s + z.w, 0) + Math.max(0, districts.length - 1) * gap;
  const compact = mode === "simulate";
  const topH = DIM.bigH - (compact ? 14 : 0);
  const row1Y = topH + (compact ? 40 : 54);
  const distY = compact ? topH + 56 : row1Y + topH + 72;

  let x = -rowW / 2, distBottom = distY;
  districts.forEach((d, i) => {
    const z = sizes[i];
    boxes[`p:${d.principalId}`] = { x, y: distY, w: z.w, h: z.h };
    d.keys.forEach((kid, j) => {
      const col = j % z.cols, row = Math.floor(j / z.cols);
      boxes[`k:${kid}`] = { x: x + DIM.pad + col * (DIM.keyW + DIM.keyGap), y: distY + headerH + row * (DIM.keyH + DIM.keyGap), w: DIM.keyW, h: DIM.keyH };
    });
    distBottom = Math.max(distBottom, distY + z.h);
    x += z.w + gap;
  });

  // ---- top structure (treasury / vault / council / members)
  // simulate mode: treasury and vault side by side (one row) so the graph stays wide, not tall
  if (has("treasury")) boxes["treasury"] = { x: compact ? -DIM.bigW - 20 : -DIM.bigW / 2, y: 0, w: DIM.bigW, h: topH };
  if (has("vault")) boxes["vault"] = { x: compact ? 20 : -DIM.bigW / 2, y: compact ? 0 : row1Y, w: DIM.bigW, h: topH };
  if (mode === "map") {
    const members = snap.nodes.filter((n) => n.type === "Member").map((n) => n.id).sort();
    const memberRowW = members.length * DIM.memberW + Math.max(0, members.length - 1) * 10;
    const cx = Math.max(380, DIM.bigW / 2 + 60 + memberRowW / 2 - 40);
    members.forEach((id, i) => { boxes[id] = { x: cx - memberRowW / 2 + i * (DIM.memberW + 10), y: 6, w: DIM.memberW, h: DIM.memberH }; });
    if (has("council")) boxes["council"] = { x: cx - DIM.councilW / 2, y: row1Y, w: DIM.councilW, h: topH };
  }

  // ---- market band (recipients, protocols, tokens), centred under the districts
  if (showMarket) {
    const group = (type: string) => snap.nodes.filter((n) => n.type === type).map((n) => n.id).sort();
    const items = [...group("Recipient"), ...group("Protocol"), ...group("Token")];
    const w = items.length * DIM.marketW + Math.max(0, items.length - 1) * DIM.marketGap;
    items.forEach((id, i) => { boxes[id] = { x: -w / 2 + i * (DIM.marketW + DIM.marketGap), y: distBottom + 96, w: DIM.marketW, h: DIM.marketH }; });
  }

  for (const id of Object.keys(boxes)) { const b = boxes[id]; boxes[id] = { x: round(b.x), y: round(b.y), w: round(b.w), h: round(b.h) }; }
  return { boxes, bounds: boundsOf(boxes), districtIds: districts.map((d) => `p:${d.principalId}`), signature: signatureOf(boxes) };
}

export function boundsOf(boxes: Record<string, Box>): Box {
  const bs = Object.values(boxes);
  if (!bs.length) return { x: 0, y: 0, w: 1, h: 1 };
  const x0 = Math.min(...bs.map((b) => b.x)), y0 = Math.min(...bs.map((b) => b.y));
  const x1 = Math.max(...bs.map((b) => b.x + b.w)), y1 = Math.max(...bs.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export const signatureOf = (boxes: Record<string, Box>) =>
  Object.keys(boxes).sort().map((k) => `${k}@${boxes[k].x},${boxes[k].y},${boxes[k].w},${boxes[k].h}`).join("|");
