// Speaker button (mute / unmute) + a small popover with the volume slider and the ambient switch. Preferences persist (audioStore).
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Volume2, VolumeX } from "lucide-react";
import { useAudioStore } from "./audioStore";
import { engine, reducedMotion } from "./engine";
import { sfx } from "./sounds";

export function SoundToggle({ className = "" }: { className?: string }) {
  const enabled = useAudioStore((s) => s.enabled);
  const volume = useAudioStore((s) => s.volume);
  const ambient = useAudioStore((s) => s.ambient);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const calm = reducedMotion();

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const toggle = () => {
    engine.unlock();
    const next = !useAudioStore.getState().enabled;
    useAudioStore.getState().setEnabled(next);
    if (next) setTimeout(() => sfx.click(), 60);
  };
  const Icon = enabled && volume > 0 ? Volume2 : VolumeX;
  return (
    <div ref={box} className={`relative ${className}`} data-sfx="off">
      <div className="toy-card toy-pill-toggle" role="group" aria-label="Âm thanh" style={{ borderRadius: 999, padding: 4 }}>
        <button type="button" onClick={toggle} aria-pressed={enabled} aria-label={enabled ? "Tắt âm thanh" : "Bật âm thanh"} title={enabled ? "Tắt âm thanh" : "Bật âm thanh"}>
          <Icon size={18} strokeWidth={2.6} aria-hidden />
        </button>
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Âm lượng" title="Âm lượng" style={{ paddingInline: 6 }}>
          <ChevronDown size={15} strokeWidth={3} aria-hidden />
        </button>
      </div>
      {open ? (
        <div className="toy-card absolute right-0 top-full z-50 mt-2 flex w-[210px] flex-col gap-3 p-3.5" role="dialog" aria-label="Âm lượng">
          <label className="flex flex-col gap-1.5 font-toy text-[15px] font-bold" style={{ color: "var(--ink)" }}>
            Âm lượng
            <input type="range" min={0} max={100} step={1} value={Math.round(volume * 100)} aria-label="Âm lượng"
              onChange={(e) => { engine.unlock(); const v = Number(e.target.value) / 100; useAudioStore.getState().setVolume(v); if (!enabled && v > 0) useAudioStore.getState().setEnabled(true); }}
              onPointerUp={() => sfx.pop()} style={{ accentColor: "var(--violet)" }} />
          </label>
          <label className="flex items-center justify-between gap-2 font-toy text-[15px] font-bold" style={{ color: "var(--ink)", opacity: calm ? 0.5 : 1 }}>
            <span>Nhạc nền nhẹ{calm ? <span className="block text-[12px] font-semibold">đang tắt do giảm chuyển động</span> : null}</span>
            <input type="checkbox" checked={ambient && !calm} disabled={calm} onChange={(e) => { engine.unlock(); useAudioStore.getState().setAmbient(e.target.checked); }} style={{ accentColor: "var(--violet)", width: 20, height: 20 }} />
          </label>
        </div>
      ) : null}
    </div>
  );
}
