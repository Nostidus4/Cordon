// Screen-region ownership: every overlay region of the stage carries data-slot="...". `intersectingPairs` is the pure check
// (unit-tested); `checkSlotOverlaps` reads the live DOM (exposed as window.__stageOverlaps in dev, see devHooks.ts).
export interface SlotRect { slot: string; left: number; top: number; right: number; bottom: number }

/** Slots that legitimately cover the screen (modal end card) and are not part of the region check. */
const IGNORED = new Set(["end-card"]);

export function intersectingPairs(rects: SlotRect[], tolerance = 0.5): [string, string][] {
  const out: [string, string][] = [];
  const rs = rects.filter((r) => !IGNORED.has(r.slot));
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > tolerance && h > tolerance) out.push([a.slot, b.slot]);
    }
  }
  return out;
}

/** Visible slots of the current page and the pairs among them that intersect. */
export function checkSlotOverlaps(root: ParentNode = document): { slots: SlotRect[]; overlaps: [string, string][] } {
  const slots: SlotRect[] = [];
  root.querySelectorAll<HTMLElement>("[data-slot]").forEach((el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    slots.push({ slot: el.dataset.slot!, left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) });
  });
  return { slots, overlaps: intersectingPairs(slots) };
}
