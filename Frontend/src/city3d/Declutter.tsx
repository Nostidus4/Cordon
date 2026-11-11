import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { cards } from "./cardRegistry";
import { layoutCards, LINE_BASE } from "./cardLayout";

const MIN_INTERVAL = 50; // ms: ~20 Hz
const FORCE_EVERY = 500; // ms: re-measure even when the camera is still (card text can change width)

/**
 * Screen-space declutter: nudge label cards up (extending their leader line) until no rectangles overlap (8px gap).
 * Throttled to ~20 Hz, and skipped entirely while the camera is still and every card has settled (the layout pass
 * reads offsetWidth/Height, which forces a style/layout flush).
 */
export default function Declutter() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const tmp = useRef(new Vector3());
  const last = useRef(0);
  const sig = useRef("");
  const settled = useRef(false);
  const lastForce = useRef(0);
  useFrame(() => {
    const now = performance.now();
    if (now - last.current < MIN_INTERVAL) return;
    const scaleStr = document.documentElement.style.getPropertyValue("--card-scale");
    const e = camera.matrixWorld.elements;
    const s = `${camera.zoom.toFixed(3)}|${e[12].toFixed(2)},${e[13].toFixed(2)},${e[14].toFixed(2)}|${e[0].toFixed(3)},${e[2].toFixed(3)}|${size.width}x${size.height}|${scaleStr}|${cards.size}`;
    if (s === sig.current && settled.current && now - lastForce.current < FORCE_EVERY) return;
    if (s === sig.current && now - lastForce.current >= FORCE_EVERY) lastForce.current = now;
    else if (s !== sig.current) lastForce.current = now;
    sig.current = s;
    last.current = now;
    const scale = parseFloat(scaleStr) || 1;
    const boxes = [...cards.entries()].map(([id, c]) => {
      c.anchor.getWorldPosition(tmp.current);
      tmp.current.project(camera);
      return {
        id,
        x: (tmp.current.x * 0.5 + 0.5) * size.width,
        y: (-tmp.current.y * 0.5 + 0.5) * size.height,
        w: c.el.offsetWidth * scale,
        h: (c.el.offsetHeight - c.line.offsetHeight) * scale,
      };
    });
    const nudges = layoutCards(boxes, scale);
    let moving = false;
    for (const [id, nudge] of nudges) {
      const c = cards.get(id)!;
      const d = nudge - c.nudge;
      if (Math.abs(d) > 0.25) moving = true;
      c.nudge += d * 0.35;
      c.line.style.height = `${LINE_BASE + c.nudge}px`;
    }
    settled.current = !moving;
  });
  return null;
}
