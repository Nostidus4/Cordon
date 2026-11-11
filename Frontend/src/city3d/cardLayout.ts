export interface CardBox {
  id: string;
  x: number; // anchor (hotspot) screen x, px
  y: number; // anchor screen y, px
  w: number; // card width incl. scale
  h: number; // card height incl. scale (without the leader line)
}

export const LINE_BASE = 14;
export const MAX_NUDGE = 26; // leader never longer than ~40px
const GAP = 8;

/**
 * Screen-space declutter. Cards stay centered on their own anchor (x never changes); colliding cards are only
 * stacked higher (extra vertical nudge, capped so the leader stays short). Front-most (lowest) cards are placed first.
 */
export function layoutCards(cards: CardBox[], scale = 1): Map<string, number> {
  const out = new Map<string, number>();
  const placed: { l: number; r: number; t: number; b: number }[] = [];
  for (const c of [...cards].sort((a, b) => b.y - a.y)) {
    let nudge = 0;
    for (let guard = 0; guard < 12; guard++) {
      const bottom = c.y - (LINE_BASE + nudge) * scale;
      const rect = { l: c.x - c.w / 2 - GAP, r: c.x + c.w / 2 + GAP, t: bottom - c.h, b: bottom };
      const hit = placed.find((p) => rect.l < p.r && rect.r > p.l && rect.t < p.b && rect.b > p.t);
      if (!hit) {
        placed.push(rect);
        break;
      }
      const next = nudge + (rect.b - hit.t) / scale + 2;
      if (next > MAX_NUDGE) {
        nudge = MAX_NUDGE;
        placed.push({ l: rect.l, r: rect.r, t: c.y - (LINE_BASE + nudge) * scale - c.h, b: c.y - (LINE_BASE + nudge) * scale });
        break;
      }
      nudge = next;
    }
    out.set(c.id, nudge);
  }
  return out;
}
