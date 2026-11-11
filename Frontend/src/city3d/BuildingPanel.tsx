import { AnimatePresence, motion } from "framer-motion";
import { BUILDING_BY_CODE, STATES, STATE_COLOR, STATE_ICON, STATE_LABEL } from "./buildings";
import { useCityStore } from "./cityStore";
import { StatusChip, EvidenceBadge, type Status } from "../components/ui";

const STATUS: Record<string, Status> = { normal: "ok", warning: "warn", incident: "bad", recovery: "locked" };
import { BuildingIcon } from "./icons";

export default function BuildingPanel() {
  const code = useCityStore((s) => s.selected);
  const state = useCityStore((s) => (s.selected ? s.states[s.selected] : "normal"));
  const setState = useCityStore((s) => s.setState);
  const select = useCityStore((s) => s.select);
  const live = useCityStore((s) => s.source === "live");
  const reason = useCityStore((s) => (s.selected ? s.reasons[s.selected] : undefined));
  const def = code ? BUILDING_BY_CODE[code] : null;
  const c = STATE_COLOR[state];
  return (
    <AnimatePresence>
    {def && code && (
    <motion.aside key={code} initial={{ opacity: 0, x: 40, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }} transition={{ type: "spring", stiffness: 240, damping: 26 }} aria-label="Chi tiết công trình" className="pointer-events-auto rounded-2xl border bg-[linear-gradient(160deg,rgba(52,46,140,0.86),rgba(14,16,62,0.9))] p-4 text-slate-100 shadow-[0_10px_40px_rgba(4,4,36,0.6),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl" style={{ borderColor: c }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <BuildingIcon code={code} className="h-8 w-8" />
          <div>
            <div className="font-mono text-xs text-cyan-300">{def.code}</div>
            <h2 className="text-lg font-bold leading-tight">{def.name}</h2>
          </div>
        </div>
        <StatusChip status={STATUS[state]}>{STATE_LABEL[state]}</StatusChip>
      </div>
      <dl className="mt-2 text-sm">
        <dt className="text-[11px] uppercase tracking-wider text-slate-400">Vai trò</dt>
        <dd>{def.role}</dd>
        <dt className="mt-1 text-[11px] uppercase tracking-wider text-slate-400">Kích thước quy ước</dt>
        <dd>{def.size}</dd>
      </dl>
      <p className="mt-3 rounded-xl border p-2.5 text-sm leading-relaxed" style={{ borderColor: `${c}88`, background: `${c}18` }} role="status" aria-live="polite">
        <b className="mb-0.5 block text-[11px] uppercase tracking-wider" style={{ color: c }}>{STATE_ICON[state]} {STATE_LABEL[state]}</b>
        {live && reason ? reason.reasonVi : def.texts[state]}
      </p>
      {live && reason?.evidence && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-slate-300">
          <span>Bằng chứng:</span>
          <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">{reason.evidence.kind} · {reason.evidence.ref}</span>
          <EvidenceBadge txHash={reason.evidence.txHash} simulated={reason.evidence.simulated} />
        </div>
      )}
      {live && <p className="mt-1 text-[11px] text-slate-400">Dữ liệu trực tiếp. Bấm nút bên dưới để chuyển sang chế độ demo.</p>}
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {STATES.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={state === s}
            onClick={() => setState(code, s)}
            className={"rounded-lg border px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-white " + (state === s ? "text-white" : "border-white/20 text-slate-300 hover:bg-white/10")}
            style={state === s ? { borderColor: STATE_COLOR[s], background: `${STATE_COLOR[s]}44` } : undefined}
          >
            <span aria-hidden>{STATE_ICON[s]} </span>{STATE_LABEL[s]}
          </button>
        ))}
      </div>
      <button type="button" onClick={() => select(null)} className="mt-3 w-full rounded-lg border border-cyan-300/50 bg-cyan-400/10 px-3 py-1.5 text-sm hover:bg-cyan-400/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
        ← Xem toàn thành phố <kbd className="ml-1 rounded border border-white/30 px-1 text-[10px]">Esc</kbd>
      </button>
    </motion.aside>
    )}
    </AnimatePresence>
  );
}
