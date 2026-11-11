// The persistent full-bleed 3D layer. The heavy runtime (three/r3f/drei + src/city3d/CityStage.tsx) is a lazy chunk (CityRuntime); until it is
// ready the blurred poster + progress card (StageLoader) cover the screen, then cross-fade to the live canvas. When 3D is unavailable
// (no WebGL, weak device, lost context) the poster stays as a light placeholder that glides between "shots". The canvas never remounts
// when the scene changes: only props change.
import { lazy, Suspense, useEffect, useState } from "react";
import type { CameraShot, CityStageProps } from "./contract";
import { probeLite, useLoadStore } from "./loadStore";
import { StageLoader } from "./StageLoader";
import { useReduced } from "./ui";

const CityRuntime = lazy(() => import("./CityRuntime"));

// where the placeholder "camera" looks: [origin-x %, origin-y %, scale]
const SHOT_VIEW: Record<string, [number, number, number]> = {
  overview: [50, 50, 1.02], "district-minh": [30, 56, 1.5], council: [38, 24, 1.55], vault: [24, 48, 1.55],
  gate: [74, 74, 1.55], shore: [62, 90, 1.35],
};
const shotKey = (s: CameraShot) => (typeof s === "string" ? s : "overview");

function Placeholder({ shot, night }: Pick<CityStageProps, "shot" | "night">) {
  const [ox, oy, sc] = SHOT_VIEW[shotKey(shot)] ?? SHOT_VIEW.overview;
  const img = (n: boolean) => `${import.meta.env.BASE_URL}stage-city-${n ? "night" : "day"}.jpg`;
  const layer = (n: boolean) => (
    <div className="absolute inset-0 bg-cover bg-center transition-opacity duration-700" style={{ backgroundImage: `url(${img(n)})`, opacity: !!night === n ? 1 : 0 }} />
  );
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#6f8ff3]" data-placeholder-city>
      <div className="absolute inset-0 transition-transform duration-[1400ms] ease-[cubic-bezier(.22,1,.36,1)]" style={{ transformOrigin: `${ox}% ${oy}%`, transform: `scale(${sc})` }}>
        {layer(false)}{layer(true)}
      </div>
    </div>
  );
}

export function CityLayer(props: CityStageProps) {
  const phase = useLoadStore((s) => s.phase);
  const reduced = useReduced();
  // decided once per page load, before any 3D code is requested
  useState(() => { const r = probeLite(); if (r) useLoadStore.getState().setLite(r); });
  const lite = phase === "lite";
  const ready = phase === "revealed";
  const [mountedReady] = useState(ready); // already revealed earlier in this session (came back to the stage): no fade
  useEffect(() => { document.getElementById("boot")?.remove(); }, []); // the static first-paint poster from index.html
  useEffect(() => {
    if (lite) return;
    // remember when the very first chunk is here: 12% = stage code loaded, the runtime chunk is requested right now
    useLoadStore.getState().setProgress(12);
  }, [lite]);

  if (lite) return (
    <>
      <Placeholder shot={props.shot} night={props.night} />
      <LiteNote />
    </>
  );
  const show = ready || mountedReady;
  return (
    <>
      <div className="absolute inset-0 bg-[#6f8ff3]" data-city-layer data-ready={show ? "1" : "0"}
        style={{ opacity: show ? 1 : 0, transform: show || reduced ? "none" : "scale(1.07)", transition: reduced || mountedReady ? "none" : "opacity 900ms ease-out, transform 1500ms cubic-bezier(.22,1,.36,1)" }}>
        <Suspense fallback={null}><CityRuntime {...props} /></Suspense>
      </div>
      <StageLoader night={props.night} />
    </>
  );
}

function LiteNote() {
  const reason = useLoadStore((s) => s.liteReason);
  const why = reason === "no-webgl" ? "Trình duyệt này chưa bật được 3D" : reason === "slow-device" ? "Máy hơi yếu để dựng 3D" : reason === "context-lost" ? "Khung 3D vừa bị ngắt" : "Bạn chọn xem bản nhẹ";
  return (
    <div className="pointer-events-auto absolute right-4 top-[84px] z-30 flex max-w-[360px] items-center gap-3 toy-card px-4 py-2.5" style={{ borderRadius: 22 }} role="status" data-lite-note>
      <span className="whitespace-nowrap font-toy text-[16px] font-extrabold" style={{ color: "var(--violet-d)" }}>Chế độ nhẹ</span>
      <span className="toy-body" style={{ fontSize: 12.5, lineHeight: 1.3 }}>{why}. Ảnh thành phố thay cho 3D, câu chuyện vẫn chạy đủ.</span>
      {reason === "slow-device" || reason === "skipped" ? (
        <a className="whitespace-nowrap font-toy text-[13px] font-bold underline" style={{ color: "var(--blue)" }} href={`${location.pathname}?lite=0`}>Thử 3D</a>
      ) : null}
    </div>
  );
}
