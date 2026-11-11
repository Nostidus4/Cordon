import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Boxes, Bot, Building2, CornerDownLeft, FileCheck2, FlaskConical, Info, Lock, Map as MapIcon, PauseCircle, Play, Radio, RotateCcw, Search, ShieldAlert, ShieldCheck, Swords, Users } from "lucide-react";
import { useUiStore } from "../../store/uiStore";
import { useActions } from "../../hooks/useActions";
import { Kbd } from "./Kbd";
import { cn } from "./cn";

export interface Cmd { id: string; group: "Chuyển màn" | "Thao tác demo" | (string & {}); label: string; hint?: string; icon: ReactNode; run: () => void; demoOnly?: boolean; keywords?: string }

// --- registry: features add commands without editing this file ---
const registry = new Map<string, Cmd>();
const subs = new Set<() => void>();
let snapshot: Cmd[] = [];
const emit = () => { snapshot = [...registry.values()]; subs.forEach((f) => f()); };
/** Register a command; returns an unregister function. Same id replaces the previous one. */
export function registerCommand(c: Cmd): () => void {
  registry.set(c.id, c); emit();
  return () => { if (registry.get(c.id) === c) { registry.delete(c.id); emit(); } };
}
/** Register commands while the calling component is mounted. Pass a memoised array. */
export function useRegisterCommands(cmds: Cmd[]) {
  useEffect(() => { const offs = cmds.map(registerCommand); return () => offs.forEach((f) => f()); }, [cmds]);
}
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const getSnapshot = () => snapshot;
const strip = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").toLowerCase();

/** ⌘K / Ctrl+K: jump to screens, run demo actions. Mount once (AppShell). */
export function CommandPalette() {
  const open = useUiStore((s) => s.paletteOpen);
  const setOpen = useUiStore((s) => s.setPaletteOpen);
  const demoMode = useUiStore((s) => s.demoMode);
  const mode = useUiStore((s) => s.mode);
  const setMode = useUiStore((s) => s.setMode);
  const nav = useNavigate();
  const a = useActions();
  const extra = useSyncExternalStore(subscribe, getSnapshot);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); useUiStore.getState().setPaletteOpen(!useUiStore.getState().paletteOpen); }
      else if (e.key === "Escape" && useUiStore.getState().paletteOpen) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);
  useEffect(() => { if (open) { setQ(""); setIdx(0); setTimeout(() => input.current?.focus(), 20); } }, [open]);

  const go = (p: string) => () => nav(p);
  const cmds: Cmd[] = useMemo(() => [
    { id: "map", group: "Chuyển màn", label: "Map · Bản đồ quyền", icon: <MapIcon className="size-4" />, run: go("/map"), keywords: "ban do canh 1" },
    { id: "sim", group: "Chuyển màn", label: "Simulate · Giả lập bị chiếm", icon: <FlaskConical className="size-4" />, run: go("/simulate"), keywords: "gia lap canh 2" },
    { id: "inc", group: "Chuyển màn", label: "Incident · Sự cố", icon: <ShieldAlert className="size-4" />, run: go("/incident"), keywords: "su co canh 4" },
    { id: "req", group: "Chuyển màn", label: "Requests · Đơn đề xuất", icon: <FileCheck2 className="size-4" />, run: go("/requests"), keywords: "de xuat don canh 3 5" },
    { id: "cou", group: "Chuyển màn", label: "Council · Hội đồng", icon: <Users className="size-4" />, run: go("/council"), keywords: "hoi dong" },
    { id: "abo", group: "Chuyển màn", label: "About · Pháp lý", icon: <Info className="size-4" />, run: go("/about"), keywords: "phap ly" },
    { id: "city", group: "Chuyển màn", label: "Thành phố 3D", icon: <Building2 className="size-4" />, run: go("/city"), keywords: "city 3d" },
    { id: "kit", group: "Chuyển màn", label: "UI kit (dev)", icon: <Boxes className="size-4" />, run: go("/_kit") },
    { id: "mode", group: "Thao tác demo", label: mode === "live" ? "Chuyển sang Replay" : "Chuyển sang Live", icon: <Radio className="size-4" />, run: () => setMode(mode === "live" ? "replay" : "live") },
    { id: "agent", group: "Thao tác demo", label: "Chạy agent buổi sáng", hint: "swap 5.000 tUSDC → tTKB", icon: <Bot className="size-4" />, run: () => a.runAgent.mutate(), demoOnly: true, keywords: "agent rebalance" },
    { id: "v2", group: "Thao tác demo", label: "Áp dụng policy v2 (gom khu, 2/3 duyệt)", hint: "Lan + Trang duyệt", icon: <ShieldCheck className="size-4" />, run: () => a.policyV2.mutate(), demoOnly: true, keywords: "policy v2 gom khu" },
    { id: "atk", group: "Thao tác demo", label: "Bắt đầu tấn công (cảnh 4)", icon: <Swords className="size-4" />, run: () => { nav("/incident"); a.runScene4.mutate(); }, demoOnly: true, keywords: "attacker scene4" },
    { id: "lock", group: "Thao tác demo", label: "Khoá khu anh Minh (Lan)", icon: <Lock className="size-4" />, run: () => a.lock.mutate({ principalId: "minh", member: "lan" }), demoOnly: true },
    { id: "s7", group: "Thao tác demo", label: "Thử gửi bằng thẻ đã khoá (bước 7)", icon: <ShieldAlert className="size-4" />, run: () => a.step7.mutate(), demoOnly: true },
    { id: "pause", group: "Thao tác demo", label: "Dừng cả kho (Lan)", icon: <PauseCircle className="size-4" />, run: () => a.pause.mutate({ member: "lan" }), demoOnly: true },
    { id: "tour", group: "Thao tác demo", label: "Bắt đầu tour demo", hint: "hướng dẫn từng bước", icon: <Play className="size-4" />, run: () => window.dispatchEvent(new Event("guardian:start-tour")), keywords: "tour huong dan demo gioi thieu" },
    { id: "reset", group: "Thao tác demo", label: "Đặt lại kịch bản", hint: "về đầu cảnh 1", icon: <RotateCcw className="size-4" />, run: () => a.reset.mutate(), demoOnly: true },
  ], [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = [...cmds, ...extra].filter((c) => (!c.demoOnly || demoMode) && (!q || strip(`${c.label} ${c.keywords ?? ""}`).includes(strip(q))));
  useEffect(() => setIdx(0), [q]);
  const run = (c?: Cmd) => { if (!c) return; setOpen(false); c.run(); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { setIdx((i) => (i + 1) % Math.max(list.length, 1)); e.preventDefault(); }
    else if (e.key === "ArrowUp") { setIdx((i) => (i - 1 + list.length) % Math.max(list.length, 1)); e.preventDefault(); }
    else if (e.key === "Enter") { run(list[idx]); e.preventDefault(); }
  };
  let lastGroup = "";
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[95] grid place-items-start justify-center pt-[14vh]">
          <motion.div className="absolute inset-0 bg-[#02030c]/65 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
          <motion.div role="dialog" aria-modal="true" aria-label="Bảng lệnh" initial={{ opacity: 0, y: -12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}
            onKeyDown={onKey} className="glass relative w-[min(40rem,92vw)] overflow-hidden rounded-[var(--radius-xl)] bg-glass-strong shadow-[var(--shadow-pop)]">
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <Search className="size-5 text-faint" aria-hidden />
              <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ để chuyển màn hoặc chạy thao tác demo…" aria-label="Tìm lệnh"
                className="w-full bg-transparent text-base text-text outline-none placeholder:text-faint" />
              <Kbd>Esc</Kbd>
            </div>
            <div className="max-h-[46vh] overflow-y-auto p-2" role="listbox">
              {list.length === 0 ? <p className="px-4 py-8 text-center text-sm text-muted">Không có lệnh phù hợp</p> : null}
              {list.map((c, i) => {
                const head = c.group !== lastGroup ? c.group : null; lastGroup = c.group;
                return (
                  <div key={c.id}>
                    {head ? <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-faint">{head}</p> : null}
                    <button role="option" aria-selected={i === idx} type="button" onMouseMove={() => setIdx(i)} onClick={() => run(c)}
                      className={cn("flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-sm transition-colors", i === idx ? "bg-brand-soft text-text ring-1 ring-brand/40" : "text-muted")}>
                      <span className="text-brand">{c.icon}</span>
                      <span className="flex-1">{c.label}</span>
                      {c.hint ? <span className="text-xs text-faint">{c.hint}</span> : null}
                      {i === idx ? <CornerDownLeft className="size-3.5 text-faint" aria-hidden /> : null}
                    </button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
