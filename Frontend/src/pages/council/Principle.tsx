// "siết: 1 người · nới: 2/3 · AI: 0 quyền" explained visually (spec §3 core principle).
import { Bot, Gavel, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../components/ui";

const Seats = ({ filled, tone }: { filled: number; tone: "warn" | "ok" | "bad" }) => (
  <div className="flex items-center gap-1.5" aria-hidden>
    {[0, 1, 2].map((i) => (
      <span key={i} className={cn("grid size-7 place-items-center rounded-full border text-[11px] font-bold",
        i < filled ? (tone === "warn" ? "border-warn bg-warn text-[#2a1c00]" : "border-ok bg-ok text-[#04261d]") : "border-line-strong text-faint")}>{["T", "L", "H"][i]}</span>
    ))}
  </div>
);

function Card({ tone, icon, kicker, big, seats, children }: { tone: "warn" | "ok" | "bad"; icon: ReactNode; kicker: string; big: string; seats: ReactNode; children: ReactNode }) {
  const c = { warn: "border-warn/40 text-warn", ok: "border-ok/40 text-ok", bad: "border-bad/45 text-bad" }[tone];
  return (
    <div className={cn("glass relative overflow-hidden rounded-[var(--radius-lg)] border p-4", c.split(" ")[0])}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wider text-faint">{icon}{kicker}</p>
          <p className={cn("mt-0.5 text-[32px] font-extrabold leading-tight tracking-tight", c.split(" ")[1])}>{big}</p>
        </div>
        {seats}
      </div>
      <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{children}</p>
    </div>
  );
}

export function Principle() {
  return (
    <div className="grid grid-cols-3 gap-3" role="list" aria-label="Nguyên tắc cốt lõi" data-tour="council-principle">
      <div role="listitem"><Card tone="warn" icon={<Lock className="size-3.5" aria-hidden />} kicker="Siết" big="1 người" seats={<Seats filled={1} tone="warn" />}>Khoá khu, dừng cả kho, hạ hạn mức, gỡ whitelist. Nhanh vì chặn thiệt hại.</Card></div>
      <div role="listitem"><Card tone="ok" icon={<Gavel className="size-3.5" aria-hidden />} kicker="Nới" big="2 / 3" seats={<Seats filled={2} tone="ok" />}>Mở khoá, tăng hạn mức, thêm thẻ hay whitelist, đổi khu của thẻ. Chủ khu không tự duyệt.</Card></div>
      <div role="listitem"><Card tone="bad" icon={<Bot className="size-3.5" aria-hidden />} kicker="AI" big="0 quyền" seats={<div className="relative grid size-9 place-items-center rounded-full border border-bad/50 bg-bad-soft text-bad"><Bot className="size-5" aria-hidden /><span aria-hidden className="absolute h-[2px] w-9 -rotate-45 rounded bg-bad" /></div>}>Trợ lý chỉ đọc, giải thích và đề xuất. Không ký, không chi tiền, không tự đặt số.</Card></div>
    </div>
  );
}
