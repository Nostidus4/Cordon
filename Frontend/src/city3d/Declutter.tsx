import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { cards } from "./cardRegistry";
import { layoutCards, LINE_BASE } from "./cardLayout";

/** Screen-space declutter: nudge label cards up (extending their leader line) until no rectangles overlap (8px gap). */
export default function Declutter() {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const tmp = useRef(new Vector3());
  const frame = useRef(0);
  useFrame(() => {
    if (frame.current++ % 3) return;
    const scale = parseFloat(document.documentElement.style.getPropertyValue("--card-scale")) || 1;
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
    for (const [id, nudge] of nudges) {
      const c = cards.get(id)!;
      c.nudge += (nudge - c.nudge) * 0.35;
      c.line.style.height = `${LINE_BASE + c.nudge}px`;
    }
  });
  return null;
}
