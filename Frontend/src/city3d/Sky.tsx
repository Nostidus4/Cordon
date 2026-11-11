import { useMemo } from "react";
import { useCityStore } from "./cityStore";

/** CSS sky behind the transparent canvas: twilight (day) and starry navy-violet (night) cross-fade over ~2 s. */
export default function Sky() {
  const night = useCityStore((s) => s.mode === "night");
  const stars = useMemo(() => {
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: 110 }, () => ({ x: r() * 100, y: r() * 72, z: r() < 0.15 ? 3 : r() < 0.5 ? 2 : 1.4, d: r() * 4, o: 0.4 + r() * 0.6 }));
  }, []);
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 30%, #6f62d8 0%, #3a3fa8 52%, #1b2170 100%)" }} />
      <div
        className="absolute inset-0 transition-opacity duration-[2000ms]"
        style={{ opacity: night ? 1 : 0, background: "radial-gradient(ellipse at 50% 85%, #2e1a6e 0%, #130f4a 45%, #070a2c 100%)" }}
      />
      {/* hidden (not painted, animations idle) once the cross-fade to day has finished */}
      <div
        className="absolute inset-0"
        style={{ opacity: night ? 1 : 0, visibility: night ? "visible" : "hidden", transition: `opacity 2s, visibility 0s linear ${night ? 0 : 2}s` }}
      >
        {stars.map((st, i) => (
          <span key={i} className="city-star absolute rounded-full bg-white" style={{ left: `${st.x}%`, top: `${st.y}%`, width: st.z, height: st.z, opacity: st.o, animationDelay: `${st.d}s` }} />
        ))}
        <div className="absolute rounded-full" style={{ right: "17%", top: "7%", width: 70, height: 70, background: "radial-gradient(circle at 38% 38%, #fffbe8, #e9e4ff 60%, #b9b4f0)", boxShadow: "0 0 60px 20px rgba(190,200,255,0.35), 0 0 160px 60px rgba(120,130,255,0.2)" }} />
      </div>
      <div className="absolute inset-0 transition-opacity duration-[2000ms]" style={{ opacity: night ? 0 : 1, background: "radial-gradient(ellipse at 20% 12%, rgba(255,255,255,0.14), transparent 40%), radial-gradient(ellipse at 80% 18%, rgba(255,255,255,0.10), transparent 35%)" }} />
    </div>
  );
}
