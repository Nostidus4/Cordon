import { CordonLogo, CordonMark } from "../components/brand/Logo";
import { animate, AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { BUILDINGS, STATES, STATE_CHIP, STATE_COLOR, STATE_ICON, STATE_LABEL } from "./buildings";
import { BUILDING_BY_CODE } from "./buildings";
import { useCityStore } from "./cityStore";
import { getPlacement } from "./layout";
import { SCENARIOS, stepAt, type ScenarioId } from "./scenarios";
import { StateDot } from "./icons";

export const card =
  "pointer-events-auto rounded-2xl border border-white/15 bg-[linear-gradient(160deg,rgba(52,46,140,0.78),rgba(14,16,62,0.84))] text-slate-100 shadow-[0_10px_40px_rgba(4,4,36,0.55),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl";

const enter = { initial: { opacity: 0, x: 28 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: 28 }, transition: { type: "spring" as const, stiffness: 220, damping: 26 } };

export function Counter({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef(value);
  useEffect(() => {
    const ctl = animate(prev.current, value, { duration: 0.8, ease: "easeOut", onUpdate: (v) => ref.current && (ref.current.textContent = String(Math.round(v))) });
    prev.current = value;
    return () => ctl.stop();
  }, [value]);
  return <span ref={ref} className={className}>{value}</span>;
}

function ModeToggle() {
  const mode = useCityStore((s) => s.mode);
  const auto = useCityStore((s) => s.autoCycle);
  const setMode = useCityStore((s) => s.setMode);
  const setAuto = useCityStore((s) => s.setAutoCycle);
  return (
    <div className="flex items-center gap-2">
      <div role="group" aria-label="Chế độ ngày đêm" className="relative flex rounded-full border border-white/20 bg-black/25 p-0.5">
        {(["day", "night"] as const).map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => { setAuto(false); setMode(m); }}
            className="relative z-10 flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            {mode === m && <motion.span layoutId="mode-pill" className="absolute inset-0 -z-10 rounded-full bg-white/20 ring-1 ring-white/40" transition={{ type: "spring", stiffness: 380, damping: 30 }} />}
            <span aria-hidden>{m === "day" ? "☀" : "☾"}</span>
            {m === "day" ? "Ngày" : "Đêm"}
          </button>
        ))}
      </div>
      <button
        type="button"
        aria-pressed={auto}
        onClick={() => setAuto(!auto)}
        className={"rounded-full border px-2.5 py-1 text-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " + (auto ? "border-cyan-300 bg-cyan-400/20 text-white" : "border-white/20 text-slate-200 hover:bg-white/10")}
      >
        ⟳ Tự động
      </button>
    </div>
  );
}

function Stats() {
  const states = useCityStore((s) => s.states);
  const v = Object.values(states);
  const ok = v.filter((x) => x === "normal").length;
  const warn = v.filter((x) => x === "warning").length;
  const inc = v.filter((x) => x === "incident").length;
  const rec = v.filter((x) => x === "recovery").length;
  const items = [
    { n: ok, c: STATE_COLOR.normal, i: STATE_ICON.normal, l: "Ổn định" },
    { n: warn, c: STATE_COLOR.warning, i: STATE_ICON.warning, l: "Cảnh báo" },
    { n: inc, c: STATE_COLOR.incident, i: STATE_ICON.incident, l: "Sự cố" },
    { n: rec, c: STATE_COLOR.recovery, i: STATE_ICON.recovery, l: "Khôi phục" },
  ];
  return (
    <ul className="flex items-center gap-3" aria-label="Thống kê công trình">
      {items.map((it) => (
        <li key={it.l} className="flex items-center gap-1.5 text-[13px]" title={it.l}>
          <StateDot color={it.c} glyph={it.i} size={16} />
          <Counter value={it.n} className="min-w-[0.7rem] font-bold tabular-nums" />
          <span className="hidden text-slate-300 2xl:inline">{it.l}</span>
        </li>
      ))}
    </ul>
  );
}

const btn =
  "rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-white";

export function TopBar() {
  const sc = useCityStore((s) => s.scenario);
  const source = useCityStore((s) => s.source);
  const start = useCityStore((s) => s.startScenario);
  const stop = useCityStore((s) => s.stopScenario);
  const goLive = useCityStore((s) => s.goLive);
  const pause = useCityStore((s) => s.togglePause);
  const running = sc.id !== null && !sc.finished;
  return (
    <motion.header
      initial={{ opacity: 0, y: -24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 2.2, type: "spring", stiffness: 160, damping: 22 }}
      className={`${card} flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5`}
    >
      <div className="flex items-center gap-2.5">
        <CordonMark size={36} />
        <div className="leading-tight">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-200">Cordon</div>
          <h1 className="text-lg font-extrabold text-white">Thành phố Quyền Tiêu Tiền</h1>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Kịch bản demo">
        <button type="button" onClick={goLive} aria-pressed={source === "live"} className={`${btn} ${source === "live" ? "border-cyan-300 bg-cyan-400/25 text-white" : "border-cyan-300/40 bg-cyan-400/10 text-cyan-50 hover:bg-cyan-400/20"}`}>
          ● Dữ liệu trực tiếp
        </button>
        <button type="button" onClick={stop} className={`${btn} border-emerald-300/50 bg-emerald-400/10 text-emerald-50 hover:bg-emerald-400/20`}>
          ✓ Tất cả bình thường
        </button>
        {(Object.keys(SCENARIOS) as ScenarioId[]).map((id) => (
          <button
            key={id}
            type="button"
            aria-pressed={sc.id === id}
            onClick={() => start(id)}
            className={`${btn} relative overflow-hidden ${sc.id === id ? "border-red-300 bg-red-500/30 text-white" : "border-red-300/40 bg-red-500/10 text-red-50 hover:bg-red-500/20"}`}
          >
            <span className="relative z-10">{sc.id === id && sc.finished ? "✓" : "▶"} {SCENARIOS[id].button}{sc.id === id && !sc.finished ? ` · ${Math.round((sc.elapsed / SCENARIOS[id].total) * 100)}%` : ""}</span>
            {sc.id === id && <span aria-hidden className="absolute inset-y-0 left-0 bg-red-400/35 transition-[width] duration-200" style={{ width: `${(sc.elapsed / SCENARIOS[id].total) * 100}%` }} />}
          </button>
        ))}
        {running && (
          <>
            <button type="button" onClick={pause} className={`${btn} border-white/30 bg-white/10 text-white hover:bg-white/20`}>
              {sc.paused ? "▶ Tiếp tục" : "❚❚ Tạm dừng"}
            </button>
            <button type="button" onClick={stop} className={`${btn} border-white/30 bg-white/10 text-white hover:bg-white/20`}>
              ■ Dừng
            </button>
          </>
        )}
      </div>
      <div className="ml-auto flex items-center gap-4">
        <Stats />
        <ModeToggle />
        <span
          className={"flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold " + (source === "live" ? "border-emerald-300/60 text-emerald-200" : "border-amber-300/50 text-amber-200")}
          title="Nguồn dữ liệu"
        >
          <span aria-hidden className={"h-2 w-2 rounded-full " + (source === "live" ? "animate-pulse bg-emerald-400" : "bg-amber-300")} />
          {source === "live" ? "TRỰC TIẾP" : "DEMO"}
        </span>
      </div>
    </motion.header>
  );
}

export function IntroTitle() {
  const [show, setShow] = useState(() => !(import.meta.env.DEV && new URLSearchParams(window.location.search).get("intro") === "0"));
  useEffect(() => {
    const t = setTimeout(() => setShow(false), 2400);
    return () => clearTimeout(t);
  }, []);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="intro"
          className="pointer-events-none absolute inset-0 z-50 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(10,12,50,0.55),rgba(6,8,30,0.9))] text-center"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1.1 } }}
        >
          <motion.div initial={{ opacity: 0, y: 14, letterSpacing: "0.5em" }} animate={{ opacity: 1, y: 0, letterSpacing: "0.22em" }} transition={{ duration: 1 }} className="text-sm font-semibold uppercase text-cyan-300">
            <CordonLogo tone="light" height={64} />
          </motion.div>
          <motion.h2 initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3, duration: 0.9 }} className="mt-3 text-5xl font-extrabold text-white drop-shadow-[0_0_30px_rgba(120,140,255,0.6)] md:text-7xl">
            Thành phố <span className="text-cyan-300">Quyền Tiêu Tiền</span>
          </motion.h2>
          <motion.div initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ delay: 0.8, duration: 0.8 }} className="mt-4 h-1 w-40 origin-left rounded bg-amber-300" />
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1, duration: 0.8 }} className="mt-4 max-w-xl px-6 text-base italic text-slate-200">
            Nơi bạn học, quyết định và trải nghiệm cách tiêu tiền thông minh, an toàn và có trách nhiệm.
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const clock = (sec: number) => {
  const m = 24 + Math.round(sec);
  return `10:${String(m % 60).padStart(2, "0")}`;
};

function Check({ kind, n }: { kind: "done" | "current" | "pending"; n?: number }) {
  if (kind === "done")
    return (
      <motion.span initial={{ scale: 0.3, rotate: -40 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 420, damping: 16 }} aria-hidden className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-bold text-white">✓</motion.span>
    );
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${kind === "current" ? "animate-pulse border-sky-300 bg-sky-500/40 text-white" : "border-slate-400/60 text-slate-300"}`}
    >
      {n ?? "◯"}
    </span>
  );
}

export function IncidentColumn() {
  const sc = useCityStore((s) => s.scenario);
  const states = useCityStore((s) => s.states);
  const source = useCityStore((s) => s.source);
  const reasons = useCityStore((s) => s.reasons);
  const def = sc.id ? SCENARIOS[sc.id] : null;
  const step = def ? stepAt(def, sc.elapsed) : 0;
  const active = Object.entries(states).filter(([, s]) => s !== "normal");
  const normalCount = Object.values(states).filter((s) => s === "normal").length;
  // impact box: derived from current states (scenario text only while a demo scenario is running)
  const rows: { label: string; text: string; color: string; glyph: string }[] = def
    ? def.impact(step, sc.finished).map((r) => ({ label: r.label, text: r.text, color: r.kind === "ok" ? STATE_COLOR.normal : STATE_COLOR.warning, glyph: r.kind === "ok" ? "✓" : "i" }))
    : [
        {
          label: active.length === 0 ? "Tất cả công trình" : `Các tòa khác (${normalCount})`,
          text: "Hoạt động bình thường",
          color: STATE_COLOR.normal,
          glyph: "✓",
        },
        ...active.map(([c, st]) => ({
          label: BUILDING_BY_CODE[c].name,
          text: reasons[c]?.reasonVi ?? STATE_CHIP[st],
          color: STATE_COLOR[st],
          glyph: STATE_ICON[st],
        })),
      ];

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence mode="popLayout">
      {def ? (
        <motion.section key={def.id} layout {...enter} className="pointer-events-auto overflow-hidden rounded-2xl border border-red-400/60 bg-[#3a1030]/85 text-slate-100 shadow-[0_0_30px_rgba(255,45,61,0.25)] backdrop-blur-md" aria-live="polite">
          <div className="flex items-center justify-between gap-2 bg-red-600/40 px-3 py-2">
            <h2 className="flex items-center gap-2 text-base font-bold">
              <span aria-hidden>▲</span> {def.headline}
            </h2>
            <span className="rounded-full bg-black/30 px-2 py-0.5 text-xs">{def.time}</span>
          </div>
          <dl className="space-y-1.5 p-3 text-sm">
            {def.rows.map((r) => (
              <div key={r.label} className="flex gap-2">
                <dt aria-hidden className="w-4 text-center">{r.icon}</dt>
                <dd><b>{r.label}:</b> {r.value}</dd>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <dt aria-hidden className="w-4 text-center">▮</dt>
              <dd><b>Mức độ:</b> <span className="ml-1 rounded-full border border-red-300 bg-red-500/30 px-2 py-0.5 text-xs font-semibold">{def.severity}</span></dd>
            </div>
            <div className="flex gap-2">
              <dt aria-hidden className="w-4 text-center">●</dt>
              <dd><b>Trạng thái:</b> {sc.finished ? def.endStatus : def.statusByStep[step]}</dd>
            </div>
          </dl>
        </motion.section>
      ) : (
        <motion.section key="calm" layout {...enter} className={`${card} p-3`}>
          <h2 className="flex items-center gap-2 text-base font-bold">
            <StateDot color={active.length === 0 ? STATE_COLOR.normal : STATE_COLOR.warning} glyph={active.length === 0 ? "✓" : "▲"} size={20} />
            {active.length === 0 ? "Thành phố vận hành bình thường" : `${active.length} công trình cần chú ý`}
          </h2>
          <p className="mt-1 text-sm text-slate-300">
            {active.length === 0 ? "Cả 8 công trình đang hoạt động bình thường, không có rủi ro." : active.map(([c]) => BUILDING_BY_CODE[c].name).join(", ")}
          </p>
          {source === "live" && active.length > 0 && (
            <ul className="mt-2 space-y-1.5 text-[12px] text-slate-200">
              {active.map(([c, st]) => (
                <li key={c} className="flex gap-2">
                  <StateDot color={STATE_COLOR[st]} glyph={STATE_ICON[st]} size={16} />
                  <span><b>{BUILDING_BY_CODE[c].name}:</b> {reasons[c]?.reasonVi ?? STATE_CHIP[st]}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[11px] text-slate-400">Nguồn dữ liệu: {source === "live" ? "trực tiếp từ hệ thống" : "mô phỏng"}</p>
        </motion.section>
      )}
      </AnimatePresence>

      {def && (
        <motion.section initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.12, type: "spring", stiffness: 220, damping: 26 }} className={`${card} p-3`} aria-label="Kịch bản ứng phó">
          <h2 className="mb-2 text-sm font-bold"><span aria-hidden>⚙ </span>{def.responseTitle}</h2>
          <ol className="space-y-1">
            {def.steps.map((s, i) => {
              const kind = sc.finished || i < step ? "done" : i === step ? "current" : "pending";
              return (
                <li
                  key={s.title}
                  aria-current={kind === "current" ? "step" : undefined}
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${kind === "current" ? "border border-sky-300/70 bg-sky-400/20" : "border border-transparent"}`}
                >
                  <Check kind={kind} n={i + 1} />
                  <span className="text-sm leading-tight">
                    <span className={`block font-semibold ${kind === "pending" ? "text-slate-300" : ""}`}>{s.title}</span>
                    <span className="block text-[12px] text-slate-300">{s.desc}</span>
                  </span>
                  <span className="ml-auto shrink-0 self-start pt-0.5 font-mono text-[11px] tabular-nums text-slate-300">{kind === "pending" ? "--:--" : clock(def.stepAt[i])}</span>
                </li>
              );
            })}
          </ol>
        </motion.section>
      )}

      <section className={`${card} p-3`} aria-label="Ảnh hưởng đến thành phố">
        <h2 className="mb-2 text-sm font-bold"><span aria-hidden>▤ </span>Ảnh hưởng đến thành phố</h2>
        <ul className="space-y-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5">
              <StateDot color={r.color} glyph={r.glyph} size={20} />
              <span><b>{r.label}:</b> {r.text}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

const K = Math.SQRT1_2;
const iso = (x: number, z: number): [number, number] => [(x + z) * K * 0.78, -(x - z) * K * 0.4];

function Cube({ x, y, r, color }: { x: number; y: number; r: number; color: string }) {
  const h = r * 1.1;
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d={`M0 ${-h - r * 0.5} L${r} ${-h} L0 ${-h + r * 0.5} L${-r} ${-h}Z`} fill={color} style={{ filter: "brightness(1.35)" }} />
      <path d={`M${-r} ${-h} L0 ${-h + r * 0.5} L0 ${r * 0.5} L${-r} 0Z`} fill={color} style={{ filter: "brightness(0.75)" }} />
      <path d={`M${r} ${-h} L0 ${-h + r * 0.5} L0 ${r * 0.5} L${r} 0Z`} fill={color} style={{ filter: "brightness(0.95)" }} />
    </g>
  );
}

export function Minimap() {
  const states = useCityStore((s) => s.states);
  const selected = useCityStore((s) => s.selected);
  const select = useCityStore((s) => s.select);
  const hover = useCityStore((s) => s.hover);
  const corners = [[-66, -52], [66, -52], [66, 64], [-66, 64]].map(([x, z]) => iso(x, z));
  const road = (a: [number, number], b: [number, number]) => {
    const [x1, y1] = iso(...a);
    const [x2, y2] = iso(...b);
    return <line key={`${a}${b}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#8f8be8" strokeOpacity="0.5" strokeWidth="2.4" strokeLinecap="round" />;
  };
  const order = [...BUILDINGS].sort((a, b) => getPlacement(a.code).position[2] - getPlacement(b.code).position[2]);
  return (
    <section className={`${card} p-2.5`} aria-label="Bản đồ trạng thái">
      <h2 className="px-1 text-sm font-bold"><span aria-hidden>◈ </span>Bản đồ trạng thái</h2>
      <svg viewBox="-80 -52 160 98" className="mt-1 h-36 w-[15rem]" role="group">
        <polygon points={corners.map((c) => c.join(",")).join(" ")} fill="#2b2a78" stroke="#7d86ff" strokeOpacity="0.7" strokeWidth="1.5" strokeLinejoin="round" />
        {road([0, -50], [0, 70])}
        {road([-60, -9.5], [60, -9.5])}
        {road([-60, 17.5], [60, 17.5])}
        {order.map((b) => {
          const [x, , z] = getPlacement(b.code).position;
          const [px, py] = iso(x, z);
          const st = states[b.code];
          const on = selected === b.code;
          const r = b.round ? 7 : 8.5;
          return (
            <g
              key={b.code}
              className="cursor-pointer outline-none focus-visible:[&>ellipse]:stroke-white"
              role="button"
              tabIndex={0}
              aria-label={`${b.name}: ${STATE_CHIP[st]}`}
              onClick={() => select(b.code)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && select(b.code)}
              onMouseEnter={() => hover(b.code)}
              onMouseLeave={() => hover(null)}
            >
              <ellipse cx={px} cy={py + 2} rx={r + 4} ry={r * 0.6 + 3} fill={on ? "#ffffff33" : st === "normal" ? "transparent" : `${STATE_COLOR[st]}44`} stroke={on ? "#fff" : "none"} strokeWidth="1.5" />
              <Cube x={px} y={py} r={r} color={b.color} />
              {st !== "normal" && (
                <g transform={`translate(${px} ${py - r * 2.1})`}>
                  <circle r="5.5" fill={STATE_COLOR[st]} stroke="#10142e" strokeWidth="1" />
                  <text textAnchor="middle" dy="3" fontSize="8" fontWeight="bold" fill="#10142e">{STATE_ICON[st]}</text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </section>
  );
}

export function Legend() {
  return (
    <section className={`${card} w-72 p-3`} aria-label="Chú thích trạng thái tòa nhà">
      <h2 className="mb-1.5 text-sm font-bold">Chú thích trạng thái tòa nhà</h2>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {STATES.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <StateDot color={STATE_COLOR[s]} glyph={STATE_ICON[s]} size={20} />
            <span className="text-[12px] font-semibold leading-tight">{s === "normal" ? "Bình thường" : STATE_LABEL[s]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
