// Loading overlay of the stage: the blurred city poster fills the screen at once, a cream toy card shows real progress.
// As soon as the base island is on screen the poster cross-fades to the live canvas (so the city is seen assembling itself) and the
// card shrinks to a corner; when the build-up is done it shows "Xong!" and dismisses.
import { useEffect, useState } from "react";
import { useLoadStore } from "./loadStore";

const STEPS = [
  { label: "Đặt các tòa nhà", at: 35 },
  { label: "Thả nước", at: 65 },
  { label: "Bật đèn", at: 92 },
] as const;
const SKIP_AFTER_MS = 7000;

export const posterUrl = (night?: boolean) => `${import.meta.env.BASE_URL}stage-city-${night ? "night" : "day"}-sm.jpg`;

export function StageLoader({ night }: { night?: boolean }) {
  const phase = useLoadStore((s) => s.phase);
  const pct = useLoadStore((s) => s.pct);
  const loaded = useLoadStore((s) => s.loaded);
  const total = useLoadStore((s) => s.total);
  const assembled = useLoadStore((s) => s.assembled);
  const [gone, setGone] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setSlow(true), SKIP_AFTER_MS);
    return () => window.clearTimeout(id);
  }, []);
  useEffect(() => {
    if (!assembled) return;
    const id = window.setTimeout(() => setGone(true), 1700); // "Xong!" stays a moment, then leaves
    return () => window.clearTimeout(id);
  }, [assembled]);

  if (gone || phase === "lite") return null;
  const fading = phase === "revealed";
  const step = STEPS.filter((s) => pct >= s.at).length;
  return (
    <div className="stage-loader absolute inset-0 z-[15]" data-fading={fading ? "1" : "0"} data-done={assembled ? "1" : "0"} role="status" aria-live="polite" aria-label="Đang dựng thành phố">
      <div className="stage-loader-poster absolute inset-0" style={{ backgroundImage: `url(${posterUrl(night)})` }} />
      <div className="stage-loader-card toy-card" data-fading={fading ? "1" : "0"} data-done={assembled ? "1" : "0"}>
        {assembled ? <div className="stage-loader-done font-toy"><span aria-hidden>✓</span>Xong!</div> : <>
        <div className="flex items-baseline justify-between gap-4">
          <span className="font-toy text-[22px] font-bold leading-tight" style={{ color: "var(--ink)" }}>{fading ? "Đang xếp các tòa nhà…" : "Đang dựng thành phố…"}</span>
          <span className="num text-[22px]" style={{ color: "var(--violet-d)" }}>{pct}%</span>
        </div>
        <div className="stage-loader-bar" aria-hidden><i style={{ width: `${pct}%` }} /></div>
        <ul className="stage-loader-steps">
          {STEPS.map((s, i) => (
            <li key={s.label} data-state={i < step ? "done" : i === step ? "now" : "todo"}>
              <span aria-hidden>{i < step ? "✓" : ""}</span>{s.label}
            </li>
          ))}
        </ul>
        <div className="mt-2.5 flex items-center justify-between gap-3">
          <span className="toy-body" style={{ fontSize: 12.5 }}>{total > 0 ? `${loaded}/${total} món đã tải` : "Đang tải mã dựng 3D"}</span>
          {slow ? <button type="button" className="font-toy text-[13px] font-bold underline" style={{ color: "var(--blue)" }} onClick={() => useLoadStore.getState().setLite("skipped")}>Xem bản nhẹ</button> : null}
        </div>
        </>}
      </div>
    </div>
  );
}
