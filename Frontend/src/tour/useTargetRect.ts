// Track the viewport rect of the first existing `[data-tour="name"]` element (polls so late-mounting / animating targets are caught).
import { useEffect, useState } from "react";

export interface Rect { top: number; left: number; width: number; height: number }
const same = (a: Rect | null, b: Rect | null) => (!a || !b ? a === b : a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);
export const findTarget = (names: string[] | undefined): HTMLElement | null => {
  for (const n of names ?? []) { const el = document.querySelector<HTMLElement>(`[data-tour="${n}"]`); if (el && el.getBoundingClientRect().width > 0) return el; }
  return null;
};

/** `scrollKey` re-triggers scroll-into-view (when the step changes). */
export function useTargetRect(names: string[] | undefined, enabled: boolean, scrollKey: string): Rect | null {
  const [rect, setRect] = useState<Rect | null>(null);
  useEffect(() => {
    if (!enabled || !names?.length) { setRect(null); return; }
    let raf = 0, alive = true, scrolledFor: HTMLElement | null = null;
    const tick = () => {
      if (!alive) return;
      const el = findTarget(names);
      if (el) {
        let r = el.getBoundingClientRect();
        if (scrolledFor !== el) {
          scrolledFor = el;
          const vh = window.innerHeight;
          if (r.top < 150 || r.bottom > vh - 20) el.scrollIntoView({ block: r.height > vh - 260 ? "start" : "center", behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
        }
        r = el.getBoundingClientRect();
        const next = { top: Math.round(r.top), left: Math.round(r.left), width: Math.round(r.width), height: Math.round(r.height) };
        setRect((p) => (same(p, next) ? p : next));
      } else setRect((p) => (p === null ? p : null));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { alive = false; cancelAnimationFrame(raf); };
  }, [enabled, names?.join(","), scrollKey]); // eslint-disable-line react-hooks/exhaustive-deps
  return rect;
}
