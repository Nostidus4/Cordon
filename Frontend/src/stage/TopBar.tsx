// Slim toy top bar: company, the five-scene stepper, day/night, Live/Replay and "Chơi lại từ đầu".
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { RotateCcw } from "lucide-react";
import { useUiStore } from "../store/uiStore";
import type { SceneId } from "./contract";
import { SCENE_META, STAGE_SCENES, type StageScene } from "./logic";
import { useStageStore } from "./stageStore";
import { CheckIcon, MoonIcon, ShieldIcon, SunIcon } from "./ui";

const DOT: Record<StageScene, string> = { look: "#7a47e6", try: "#1565e8", fix: "#e8782a", incident: "#d62839", request: "#0e968c" };

export function TopBar({ scene, night, onGo, onNight, onReset, resetting }: {
  scene: SceneId; night: boolean; onGo: (s: SceneId) => void; onNight: (n: boolean) => void; onReset: () => void; resetting: boolean;
}) {
  const reached = useStageStore((s) => s.reached);
  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);
  return (
    <header className="stage-topbar-in pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 px-4 pt-3.5">
      <Link to="/" onClick={() => onGo("intro")} className="toy-card pointer-events-auto flex items-center gap-2.5 py-1.5 pl-2.5 pr-4 no-underline" style={{ borderRadius: 999 }} aria-label="Về đầu: Mây Labs (giả định)">
        <ShieldIcon size={30} />
        <span className="font-toy text-[17px] font-bold leading-none" style={{ color: "var(--ink)" }}>Mây Labs <span style={{ color: "var(--ink-2)", fontWeight: 600 }}>(giả định)</span></span>
      </Link>

      <nav aria-label="Năm cảnh" className="toy-card pointer-events-auto flex items-center gap-1 p-1.5" style={{ borderRadius: 999 }}>
        {STAGE_SCENES.map((s) => {
          const active = scene === s;
          const done = !active && reached.includes(s);
          return (
            <button key={s} type="button" onClick={() => onGo(s)} aria-current={active ? "step" : undefined}
              className="relative flex items-center gap-2 rounded-full border-0 bg-transparent py-1.5 pl-1.5 pr-3.5 font-toy text-[16px] font-bold leading-none"
              style={{ color: active ? "#fff" : "var(--ink)", cursor: "pointer" }}>
              {active ? <motion.span layoutId="stage-step" className="absolute inset-0 rounded-full" style={{ background: DOT[s], boxShadow: `0 3px 0 rgba(0,0,0,.25)` }} transition={{ type: "spring", stiffness: 420, damping: 30 }} /> : null}
              <span className="relative grid size-7 place-items-center rounded-full text-[15px]" style={{ background: active ? "rgba(255,255,255,.28)" : done ? "var(--teal-soft)" : "#f1e4cc", color: active ? "#fff" : done ? "var(--teal-ink)" : "var(--ink)" }}>
                {done ? <CheckIcon size={15} /> : SCENE_META[s].n}
              </span>
              <span className={`relative ${active ? "" : "hidden xl:inline"}`}>{SCENE_META[s].label}</span>
            </button>
          );
        })}
      </nav>

      <div className="pointer-events-auto flex items-center gap-2">
        <div className="toy-card toy-pill-toggle" role="group" aria-label="Ngày hay đêm" style={{ borderRadius: 999, padding: 4 }}>
          <button type="button" aria-pressed={!night} onClick={() => onNight(false)}><SunIcon size={18} /><span className="hidden 2xl:inline">Ngày</span></button>
          <button type="button" aria-pressed={night} onClick={() => onNight(true)}><MoonIcon size={18} /><span className="hidden 2xl:inline">Đêm</span></button>
        </div>
        <div className="toy-card toy-pill-toggle" role="group" aria-label="Chạy thật hay xem lại" style={{ borderRadius: 999, padding: 4 }}>
          <button type="button" aria-pressed={mode === "live"} onClick={() => setMode("live")}>
            <span className={mode === "live" ? "toy-live" : ""} style={{ width: 9, height: 9, borderRadius: 9, background: "var(--green-d)", display: "inline-block" }} aria-hidden />Trực tiếp
          </button>
          <button type="button" aria-pressed={mode === "replay"} onClick={() => { setMode("replay"); onGo("incident"); }}>Xem lại</button>
        </div>
        <Link to="/he-thong" className="toy-card hidden px-3.5 py-1.5 text-[13px] font-bold no-underline xl:inline-block" style={{ borderRadius: 999, color: "var(--ink-2)", borderWidth: 2 }}>Bảng kỹ thuật</Link>
        <button type="button" onClick={onReset} disabled={resetting} className="toy-btn" data-c="cream" data-size="sm" aria-label="Chơi lại từ đầu"><RotateCcw size={16} strokeWidth={2.6} aria-hidden />Chơi lại<span className="hidden 2xl:inline"> từ đầu</span></button>
      </div>
    </header>
  );
}
