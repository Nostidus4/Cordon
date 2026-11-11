// Tweens layout boxes whenever the target layout changes: moved nodes glide (keys fly between districts), new nodes fade in,
// removed ones fade out as ghosts and are dropped on completion. First render is not animated.
import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import type { Box } from "../../graph/layout";
import type { TweenBox } from "../../graph/toReactFlow";

const reduced = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const solid = (b: Record<string, Box>): Record<string, TweenBox> => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, { ...v, o: 1 }]));

export function useTweenedBoxes(target: Record<string, Box>, signature: string, duration = 1.0): { boxes: Record<string, TweenBox>; animating: boolean } {
  const [boxes, setBoxes] = useState(() => solid(target));
  const [animating, setAnimating] = useState(false);
  const cur = useRef(boxes);
  const first = useRef(true);
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const to = targetRef.current;
    const from = cur.current;
    if (reduced()) { const s = solid(to); cur.current = s; setBoxes(s); return; }
    setAnimating(true);
    const ctl = animate(0, 1, {
      duration, ease: [0.45, 0, 0.15, 1],
      onUpdate: (t) => {
        const next: Record<string, TweenBox> = {};
        for (const id of Object.keys(to)) {
          const f = from[id], b = to[id];
          next[id] = f ? { x: lerp(f.x, b.x, t), y: lerp(f.y, b.y, t), w: lerp(f.w, b.w, t), h: lerp(f.h, b.h, t), o: lerp(f.o, 1, Math.min(1, t * 1.4)) } : { ...b, o: Math.max(0, (t - 0.35) / 0.65) };
        }
        for (const id of Object.keys(from)) if (!to[id]) next[id] = { ...from[id], o: from[id].o * Math.max(0, 1 - t * 2.2) };
        cur.current = next; setBoxes(next);
      },
      onComplete: () => { const s = solid(to); cur.current = s; setBoxes(s); setAnimating(false); },
    });
    return () => ctl.stop();
  }, [signature, duration]);

  return { boxes, animating };
}
