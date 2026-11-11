// /_sound (dev only): audition every cue. Not in the production build's routes.
import { useEffect } from "react";
import { SoundToggle } from "../../audio/SoundToggle";
import { useAudioStore } from "../../audio/audioStore";
import { engine } from "../../audio/engine";
import { CUES } from "../../audio/sounds";
import { useAudioUnlock } from "../../audio/director";
import "../../stage/toy.css";

export default function SoundPage() {
  useAudioUnlock();
  const { ambient, setAmbient } = useAudioStore();
  useEffect(() => { const prev = document.title; document.title = "Nghe thử âm thanh · dev"; return () => { document.title = prev; }; }, []);
  const groups = [...new Set(CUES.map((c) => c.group))];
  return (
    <div className="stage fixed inset-0 overflow-y-auto p-6" style={{ background: "#fdf3e1" }}>
      <div className="mx-auto max-w-[900px]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h1 className="m-0 font-toy text-[28px] font-extrabold" style={{ color: "var(--ink)" }}>Nghe thử âm thanh (dev)</h1>
          <SoundToggle />
        </div>
        <p className="toy-body">Bấm một nút để nghe. Âm thanh tạo bằng Web Audio, không có file âm thanh nào. Phải bấm ít nhất một lần trước khi trình duyệt cho phát.</p>
        <div className="mb-5 flex flex-wrap gap-2">
          <button type="button" className="toy-btn" data-c={ambient ? "teal" : "cream"} data-size="sm" aria-pressed={ambient} onClick={() => { engine.unlock(); setAmbient(!ambient); }}>Nhạc nền: {ambient ? "bật" : "tắt"}</button>
          <button type="button" className="toy-btn" data-c="cream" data-size="sm" onClick={() => { engine.unlock(); engine.setNight(false); }}>Nền ban ngày</button>
          <button type="button" className="toy-btn" data-c="cream" data-size="sm" onClick={() => { engine.unlock(); engine.setNight(true); }}>Nền ban đêm</button>
        </div>
        {groups.map((g) => (
          <section key={g} className="toy-card mb-4 p-4">
            <h2 className="m-0 mb-2 font-toy text-[20px] font-bold" style={{ color: "var(--ink)" }}>{g}</h2>
            <div className="flex flex-wrap gap-2">
              {CUES.filter((c) => c.group === g).map((c) => (
                <button key={c.id} type="button" className="toy-btn" data-c="violet" data-size="xs" data-sfx="off" onClick={() => { engine.unlock(); c.play(); }}>{c.label}</button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
