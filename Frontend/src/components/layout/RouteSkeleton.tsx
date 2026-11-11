// Placeholder shown while a lazy route chunk downloads. Fast loads show (almost) nothing; after 300 ms a small toy "Đang mở…" chip appears:
// three tiny coloured blocks hopping in sequence. `stage` = poster + cream card (same look as the stage loader), `full` = full-screen dark
// page, `page` = content area inside the 2D shell. Respects prefers-reduced-motion (blocks stay still).
import { useEffect, useState } from "react";

const BLOCKS = ["#7a47e6", "#ff9a55", "#22d3c5"] as const;
const SHOW_AFTER_MS = 300;

/** Three hopping blocks + label. */
export function ToyHop({ label = "Đang mở…" }: { label?: string }) {
  return (
    <div className="toy-hop" role="status" aria-label={label}>
      <span className="toy-hop-row" aria-hidden>
        {BLOCKS.map((c, i) => <i key={c} style={{ background: c, animationDelay: `${i * 140}ms`, height: 14 + i * 5 }} />)}
      </span>
      <span className="toy-hop-label">{label}</span>
    </div>
  );
}

function useAfter(ms: number) {
  const [on, setOn] = useState(false);
  useEffect(() => { const id = window.setTimeout(() => setOn(true), ms); return () => window.clearTimeout(id); }, [ms]);
  return on;
}

export function RouteSkeleton({ kind = "page" }: { kind?: "page" | "stage" | "full" }) {
  const late = useAfter(SHOW_AFTER_MS);
  if (kind === "stage") {
    return (
      <div className="fixed inset-0 bg-[#6f8ff3]" role="status" aria-label="Đang tải">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${import.meta.env.BASE_URL}stage-city-day-sm.jpg)`, filter: "blur(6px)", transform: "scale(1.06)" }} />
        <div className="absolute left-1/2 top-1/2 w-[min(380px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[26px] border-[3px] border-white bg-[#fff8ee] px-[22px] py-[18px] shadow-[0_5px_0_#e9d5b0,0_22px_34px_-14px_rgba(60,30,130,.5)]">
          <div className="text-[22px] font-bold leading-tight text-[#2d2250]" style={{ fontFamily: '"Baloo 2", system-ui, sans-serif' }}>Đang dựng thành phố…</div>
          <div className="mt-3 h-[18px] overflow-hidden rounded-full border-[3px] border-white bg-[#fdeed6]"><div className="skel-shimmer h-full w-1/4 rounded-full bg-[#7a47e6]" /></div>
        </div>
      </div>
    );
  }
  const block = (cls: string) => <div className={`skel-shimmer rounded-xl bg-white/[0.06] ${cls}`} />;
  return (
    <div className={kind === "full" ? "fixed inset-0 bg-[#070a1c] p-6" : "relative w-full"}>
      <div className="mx-auto max-w-[1440px] space-y-4" aria-hidden>
        {block("h-8 w-64")}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">{block("h-28")}{block("h-28")}{block("h-28")}</div>
        {block("h-[46vh] w-full")}
      </div>
      {late ? <div className="pointer-events-none absolute inset-x-0 top-[28vh] z-10 flex justify-center"><ToyHop /></div> : null}
    </div>
  );
}
