import { useEffect, useRef, type ReactNode } from "react";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import { useAssembly } from "../assembly";
import { cards } from "../cardRegistry";
import { LINE_BASE } from "../cardLayout";

export const TOY_FONT = '"Baloo 2","Be Vietnam Pro",system-ui,sans-serif';

/** Cream toy pill: ink text, darker bottom edge, small colored dot/glyph. Registers with the screen-space declutter. */
export function ToyLabel({ id, position, dot, glyph, children }: { id: string; position: [number, number, number]; dot: string; glyph?: string; children: ReactNode }) {
  const anchor = useRef<Group>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  const assembled = useAssembly((s) => s.assembled);
  useEffect(() => {
    const key = `toy:${id}`;
    const t = setInterval(() => {
      if (anchor.current && wrap.current && line.current) {
        cards.set(key, { anchor: anchor.current, el: wrap.current, line: line.current, nudge: cards.get(key)?.nudge ?? 0 });
        clearInterval(t);
      }
    }, 50);
    return () => {
      clearInterval(t);
      cards.delete(key);
    };
  }, [id]);
  return (
    <group ref={anchor} position={position}>
      <Html zIndexRange={[28, 0]} style={{ pointerEvents: "none" }}>
        <div
          ref={wrap}
          className="flex flex-col items-center"
          style={{ transform: "translate(-50%,-100%) scale(var(--card-scale,1))", transformOrigin: "50% 100%", opacity: (assembled ? "var(--label-vis,1)" : 0) as never, transition: "opacity 0.35s", fontFamily: TOY_FONT }}
        >
          <span
            className="inline-flex select-none items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[1px] text-[12.5px] font-semibold leading-tight"
            style={{ background: "#fff7e8", color: "#2B2350", borderBottom: "3px solid #e0cfae", boxShadow: "0 2px 6px rgba(30,20,80,0.25)" }}
          >
            {glyph ? (
              <span aria-hidden className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-extrabold text-white" style={{ background: dot }}>{glyph}</span>
            ) : (
              <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: dot }} />
            )}
            {children}
          </span>
          <span ref={line} className="w-px" style={{ background: "#fff7e8", opacity: 0.85, height: LINE_BASE - 8 }} aria-hidden />
        </div>
      </Html>
    </group>
  );
}
