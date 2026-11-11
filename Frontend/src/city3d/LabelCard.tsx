import { useEffect, useRef } from "react";
import { Html } from "@react-three/drei";
import type { Group } from "three";
import { useAssembly } from "./assembly";
import { cards } from "./cardRegistry";
import { LINE_BASE } from "./cardLayout";
import { STATE_CHIP, STATE_COLOR, STATE_ICON, type BuildingDef } from "./buildings";
import { useCityStore } from "./cityStore";
import { BuildingIcon, StateDot } from "./icons";

/** Floating info card above a building (like the reference). Clicking it = clicking the building. */
export default function LabelCard({ def, position }: { def: BuildingDef; position: [number, number, number] }) {
  const state = useCityStore((s) => s.states[def.code]);
  const chip = useCityStore((s) => s.chips[def.code]);
  const active = useCityStore((s) => s.hovered === def.code || s.selected === def.code);
  const select = useCityStore((s) => s.select);
  const hover = useCityStore((s) => s.hover);
  const dim = useCityStore((s) => s.selected !== null && s.selected !== def.code);
  const anchor = useRef<Group>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const line = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const id = def.code;
    const t = setInterval(() => {
      if (anchor.current && wrap.current && line.current) {
        cards.set(id, { anchor: anchor.current, el: wrap.current, line: line.current, nudge: cards.get(id)?.nudge ?? 0 });
        clearInterval(t);
      }
    }, 50);
    return () => {
      clearInterval(t);
      cards.delete(id);
    };
  }, [def.code]);
  const showCards = useCityStore((s) => s.cards);
  const assembled = useAssembly((s) => s.assembled); // cards appear once the city has finished assembling
  const border = state === "normal" ? def.color : STATE_COLOR[state];
  const dot = STATE_COLOR[state];

  if (!showCards) return null;
  return (
    <group ref={anchor} position={position}>
    <Html zIndexRange={[30, 0]} style={{ pointerEvents: "none" }}>
      <div ref={wrap}
        className="flex flex-col items-center transition-opacity duration-500"
        data-dim={dim}
        style={{ transform: "translate(-50%,-100%) scale(var(--card-scale,1))", transformOrigin: "50% 100%", opacity: dim || !assembled ? 0 : 1, pointerEvents: dim || !assembled ? "none" : undefined }}
      >
        <button
          type="button"
          onClick={() => select(def.code)}
          onMouseEnter={() => hover(def.code)}
          onMouseLeave={() => hover(null)}
          onFocus={() => hover(def.code)}
          onBlur={() => hover(null)}
          aria-label={`${def.name}: ${chip ?? STATE_CHIP[state]}`}
          className="city-card pointer-events-auto flex cursor-pointer items-center gap-2 whitespace-nowrap rounded-xl border-2 px-2.5 py-1 text-left text-white outline-none transition-transform duration-200 focus-visible:ring-2 focus-visible:ring-white"
          style={{
            borderColor: border,
            background: "linear-gradient(180deg, rgba(34,28,92,0.96), rgba(16,16,60,0.96))",
            boxShadow: `0 4px 18px rgba(0,0,0,0.45), 0 0 ${active ? 22 : 8}px ${border}${active ? "aa" : "55"}`,
            transform: active ? "translateY(-3px) scale(1.06)" : undefined,
          }}
        >
          <BuildingIcon code={def.code} className="h-5 w-5 shrink-0" />
          <span className="flex flex-col">
            <span className="text-[13px] font-semibold leading-tight">{def.name}</span>
            <span className="mt-0.5 flex items-center gap-1 text-[10.5px] leading-tight text-slate-200">
              <StateDot color={dot} glyph={STATE_ICON[state]} size={12} />
              {chip ?? STATE_CHIP[state]}
            </span>
          </span>
        </button>
        <span ref={line} className="w-px" style={{ background: border, height: LINE_BASE }} aria-hidden />
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: border }} aria-hidden />
      </div>
    </Html>
    </group>
  );
}
