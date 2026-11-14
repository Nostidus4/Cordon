// Quỹ lương (B04, CITY-006): a toy card section inside the B04 drawer. A month in 10 minutes, the ladder, the two venues
// (freeze toggle in demo mode), the kill switch and the CFO note. Little text, Vietnamese; technical names only in the muted line.
import type { PayrollRung, PayrollState, PayrollVenue } from "../types";
import { useHealth } from "../hooks/useHealth";
import { usePayrollActions, usePayrollPlayer, usePayrollReport, usePayrollState } from "../hooks/usePayroll";
import { rawToBig } from "../lib/format";
import { ToyButton } from "./ui";

const DAY = 86400;

export const PHASE_VI: Record<PayrollState["phase"], string> = {
  accruing: "Đang gom tiền", unwinding: "Đang rút về", deadline: "Đã tới hạn rút về", payday: "Tới ngày lương", paid: "Đã trả lương",
};

/** Day number inside the cycle, 0..30 (clamped), and the 0..1 progress of the month. */
export function cycleProgress(s: Pick<PayrollState, "now" | "cycleStart" | "payday">): { day: number; ratio: number } {
  const total = Math.max(1, s.payday - s.cycleStart);
  const ratio = Math.min(1, Math.max(0, (s.now - s.cycleStart) / total));
  return { day: Math.min(30, Math.floor(((s.now - s.cycleStart) / DAY))), ratio };
}

/** Share of `part` in `whole` as 0..100 (bigint-safe). */
export const pct = (part: string, whole: string): number => {
  const w = rawToBig(whole);
  return w === 0n ? 0 : Number((rawToBig(part) * 10000n) / w) / 100;
};

function Timeline({ s }: { s: PayrollState }) {
  const { day, ratio } = cycleProgress(s);
  const total = s.payday - s.cycleStart;
  const mark = (ts: number) => `${Math.min(100, Math.max(0, ((ts - s.cycleStart) / total) * 100))}%`;
  return (
    <div data-payroll-timeline>
      <div className="flex items-baseline justify-between">
        <span className="font-toy text-[15px] font-bold" style={{ color: "var(--ink)" }}>Ngày {day}/30</span>
        <span className="rounded-full px-2 py-px text-[12px] font-bold" style={{ background: "var(--violet-soft)", color: "var(--violet-d)" }}>{PHASE_VI[s.phase]}</span>
      </div>
      <div className="relative mt-1.5">
        <div className="toy-bar"><i style={{ width: `${ratio * 100}%`, background: "var(--violet)" }} /></div>
        {s.rungs.map((r) => <span key={r.index} aria-hidden className="absolute top-[-3px] h-[18px] w-[3px] rounded bg-[#d9c49b]" style={{ left: mark(r.startsAt) }} />)}
        <span aria-hidden className="absolute top-[-5px] h-[22px] w-[4px] rounded" style={{ left: mark(s.deadline), background: "var(--red)" }} title="Hạn rút về" />
      </div>
    </div>
  );
}

function Ladder({ s }: { s: PayrollState }) {
  const W = 260, H = 70;
  const total = s.payday - s.cycleStart;
  const top = Math.max(1, Number(rawToBig(s.principal.raw) / 1_000_000n));
  const pts: [number, number][] = [[0, 95]];
  s.rungs.forEach((r: PayrollRung) => {
    const x = ((r.startsAt - s.cycleStart) / total) * W;
    pts.push([x, pts[pts.length - 1][1]]);
    pts.push([x, r.maxDeployedBps / 100]);
  });
  pts.push([W, 0]);
  const path = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${(H - (y / 100) * H).toFixed(1)}`).join(" ");
  const nowX = Math.min(W, Math.max(0, ((s.now - s.cycleStart) / total) * W));
  const out = Number(rawToBig(s.deployedTotal.raw) / 1_000_000n);
  const outY = H - Math.min(1, out / top) * H;
  return (
    <svg viewBox={`0 0 ${W} ${H + 4}`} role="img" aria-label="Bậc thang rút tiền về" className="w-full" data-payroll-ladder>
      <path d={path} fill="none" stroke="#7a47e6" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <line x1={nowX} x2={nowX} y1="0" y2={H} stroke="#2d2250" strokeWidth="2" strokeDasharray="3 3" />
      <circle cx={nowX} cy={outY} r="5" fill={s.killed ? "#d62839" : "#22d3c5"} stroke="#2d2250" strokeWidth="2" />
    </svg>
  );
}

function VenueCard({ v, demo, onToggle, busy }: { v: PayrollVenue; demo: boolean; onToggle: () => void; busy: boolean }) {
  const used = pct(v.deployed.raw, v.capAmount.raw);
  const stuck = v.impaired || v.frozenHint;
  const tone = stuck ? { bg: "var(--red-soft)", bd: "var(--red)", ink: "var(--red-ink)" } : { bg: "var(--teal-soft)", bd: "var(--teal)", ink: "var(--teal-ink)" };
  return (
    <li data-venue={v.id} data-stuck={stuck ? "true" : "false"} className="rounded-[14px] p-2.5" style={{ background: tone.bg, border: `2px solid ${tone.bd}` }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-toy text-[15px] font-bold" style={{ color: "var(--ink)" }}>{v.label}</span>
        <span className="text-[12px] font-bold" style={{ color: tone.ink }}>{stuck ? "Đang kẹt" : "Ổn"}</span>
      </div>
      <div className="toy-bar mt-1.5"><i style={{ width: `${Math.min(100, used)}%`, background: stuck ? "var(--red)" : "var(--teal)" }} /></div>
      <div className="mt-1 flex items-center justify-between text-[12.5px] font-semibold" style={{ color: "var(--ink)" }}>
        <span>{v.deployed.display} / {v.capAmount.display}</span>
        {demo ? <ToyButton size="xs" color={v.frozen ? "green" : "orange"} disabled={busy} onClick={onToggle}>{v.frozen ? "Mở lại" : "Làm kẹt"}</ToyButton> : null}
      </div>
    </li>
  );
}

export function PayrollPanel() {
  const demo = !!useHealth().data?.demoMode;
  const { data: s, isError } = usePayrollState();
  const report = usePayrollReport();
  const act = usePayrollActions();
  const player = usePayrollPlayer(s);
  if (!s) return <p className="toy-body m-0" role="status">{isError ? "Chưa đọc được quỹ lương." : "Đang đọc quỹ lương…"}</p>;
  const jump = (ts: number) => act.advance.mutate(Math.max(1, ts - s.now));
  const busy = act.advance.isPending || act.freeze.isPending || act.kill.isPending;
  const covers = s.vaultCoversPayroll;
  return (
    <section className="mt-3 flex flex-col gap-2.5 border-t-2 border-dashed pt-3" style={{ borderColor: "#ecdcbc" }} aria-label="Quỹ lương" data-payroll-panel>
      <div className="toy-eyebrow" style={{ fontSize: 14 }}>Quỹ lương</div>
      <Timeline s={s} />
      <Ladder s={s} />
      <div className="grid grid-cols-2 gap-2">
        <div className="toy-tile" data-tone={covers ? "teal" : "amber"}><div className="toy-tile-label">Trong kho</div><div className="font-toy text-[17px] font-bold">{s.idle.display}</div></div>
        <div className="toy-tile"><div className="toy-tile-label">Cần ngày lương</div><div className="font-toy text-[17px] font-bold">{s.payrollTotal.display}</div></div>
      </div>
      <p role="status" className="m-0 text-[13px] font-bold" style={{ color: s.guarantee.ok ? "var(--teal-ink)" : "var(--red-ink)" }} data-guarantee={s.guarantee.ok ? "ok" : "low"}>{s.guarantee.reasonVi}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Các nơi gửi">
        {s.venues.map((v) => <VenueCard key={v.id} v={v} demo={demo} busy={busy} onToggle={() => act.freeze.mutate({ venue: v.id, frozen: !v.frozen })} />)}
      </ul>
      {s.killed ? <div className="rounded-[14px] px-3 py-2 text-[13px] font-bold" style={{ background: "var(--red-soft)", border: "2px solid var(--red)", color: "var(--red-ink)" }} data-killed>{s.killReasonVi ?? "Công tắc khẩn cấp đang bật."}</div> : null}
      {demo ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Điều khiển thử">
          <ToyButton size="xs" color="violet" onClick={player.toggle}>{player.playing ? "Tạm dừng" : "Chạy một tháng"}</ToyButton>
          <ToyButton size="xs" color="cream" disabled={busy} onClick={() => jump(s.deadline - 14 * s.dayUnit)}>Tới T-14</ToyButton>
          <ToyButton size="xs" color="cream" disabled={busy} onClick={() => jump(s.deadline - s.dayUnit)}>Tới T-1</ToyButton>
          <ToyButton size="xs" color="cream" disabled={busy} onClick={() => jump(s.deadline)}>Tới hạn</ToyButton>
          <ToyButton size="xs" color="blue" disabled={act.runAgent.isPending} onClick={() => act.runAgent.mutate()}>Agent làm việc</ToyButton>
          <ToyButton size="xs" color="teal" disabled={act.execute.isPending || s.executed} onClick={() => act.execute.mutate()}>Trả lương</ToyButton>
          <ToyButton size="xs" color="cream" onClick={() => act.reset.mutate()}>Làm lại</ToyButton>
        </div>
      ) : null}
      <ToyButton size="sm" color="red" disabled={s.killed || act.kill.isPending} done={s.killed} onClick={() => act.kill.mutate()}>{s.killed ? "Đã bật công tắc" : "Công tắc khẩn cấp"}</ToyButton>
      {report.data ? (
        <div className="rounded-[14px] p-2.5" style={{ background: "#f6ecd9", border: "2px solid #ecdcbc" }} data-cfo-report>
          <div className="flex items-center justify-between"><span className="font-toy text-[14px] font-bold">Bản tin CFO</span>
            <span className="text-[11px] font-bold" style={{ color: "var(--violet-d)" }}>{report.data.reasonSource === "llm" ? "AI viết" : "mẫu cố định"}</span></div>
          <p className="toy-body m-0 mt-1" style={{ fontSize: 12.5, lineHeight: 1.35 }}>{report.data.text}</p>
        </div>
      ) : null}
      <p className="m-0 text-[11.5px] font-semibold" style={{ color: "var(--ink-2)" }} data-inside>Bên trong: PayrollVault · FloatPolicy · LadderScheduler · đề #21</p>
    </section>
  );
}
