// In-browser stand-in for /api/payroll (mock mode only): the PAYROLL.md section 8 month as a deterministic function of the
// virtual day. Not a second rule engine: positions follow the illustrative table (A and B at 12.000, ladder 60/30/10/0 %),
// venue B stops answering once frozen, the deadline pulls everything back and the reserve covers what is stuck.
import { money, toBase } from "../format";
import type { Money, PayrollRung, PayrollState, PayrollVenue } from "../../types";

export const DAY = 86400;
const CYCLE_DAYS = 30;
const P = toBase(30000);
const RESERVE = toBase(12000);
const LADDER: { before: number; bps: number }[] = [{ before: 14, bps: 6000 }, { before: 7, bps: 3000 }, { before: 3, bps: 1000 }, { before: 0, bps: 0 }];
const T0 = 1_800_000_000;

export interface MockPayrollWorld { second: number; frozen: Set<string>; killed: boolean; killReason: number; executed: boolean; scale: number }
export const newPayrollWorld = (): MockPayrollWorld => ({ second: 0, frozen: new Set(), killed: false, killReason: 0, executed: false, scale: 4320 });

const m = (v: bigint): Money => money(v);
const deadlineDay = CYCLE_DAYS - 1;

/** Ceiling (bps) at day d: 9500 before the first rung, then the rung that has started. */
const ceilingBps = (d: number): number => {
  let bps = 9500;
  for (const r of LADDER) if (d >= deadlineDay - r.before) bps = r.bps;
  return bps;
};

export function derivePayroll(w: MockPayrollWorld): PayrollState {
  const day = w.second / DAY;
  const afterDeadline = day >= deadlineDay;
  const killed = w.killed || afterDeadline;
  const bFrozenSince = w.frozen.has("venue_b");
  const ceiling = (P * BigInt(ceilingBps(day))) / 10000n;
  // healthy venue A follows the ceiling (half each while nothing is stuck); B keeps what it held when it froze
  const baseline = killed && !afterDeadline ? 0n : ceiling / 2n;
  const cap = (P * 4000n) / 10000n;
  const place = (v: bigint) => (v > cap ? cap : v);
  const a = afterDeadline || w.killed ? 0n : place(day < 0.5 ? 0n : baseline);
  const bHeld = day < 0.5 ? 0n : place(ceilingBps(Math.min(day, 20)) > 0 ? (P * BigInt(ceilingBps(Math.min(day, 20)))) / 20000n : 0n);
  const b = bFrozenSince ? bHeld : afterDeadline || w.killed ? 0n : a;
  const deployed = a + b;
  const stuck = bFrozenSince ? b : 0n;
  const outside = afterDeadline ? stuck : deployed; // after the deadline everything healthy is back
  const balance = P + RESERVE - outside;
  const reserveLeft = afterDeadline ? (balance > P ? balance - P : 0n) : RESERVE;
  const idle = balance - reserveLeft;
  const impaired = bFrozenSince && day >= deadlineDay - 7;
  const phase = w.executed ? "paid" : day >= CYCLE_DAYS ? "payday" : afterDeadline ? "deadline" : day >= deadlineDay - 14 ? "unwinding" : "accruing";
  const venue = (id: string, label: string, held: bigint, yieldBps: number): PayrollVenue => ({
    id, addr: id === "venue_a" ? "0xA000000000000000000000000000000000000001" : "0xB000000000000000000000000000000000000002", label, allowed: true,
    impaired: id === "venue_b" && impaired, frozenHint: id === "venue_b" && impaired, frozen: w.frozen.has(id),
    deployed: m(held), capAmount: m(cap), due: m(0n), assetsOf: m(held), yieldBpsPerDay: yieldBps,
  });
  const rungs: PayrollRung[] = LADDER.map((r, i) => ({
    index: i, beforeDeadline: r.before * DAY, startsAt: T0 + (deadlineDay - r.before) * DAY, maxDeployedBps: r.bps,
    ceilingAmount: m((P * BigInt(r.bps)) / 10000n), active: day >= deadlineDay - r.before && (i === LADDER.length - 1 || day < deadlineDay - LADDER[i + 1].before),
  }));
  const exposure = cap > RESERVE ? RESERVE : cap;
  return {
    now: T0 + w.second, cycleId: 1, cycleStart: T0, payday: T0 + CYCLE_DAYS * DAY, deadline: T0 + deadlineDay * DAY, phase,
    payrollTotal: m(P), principal: m(P), reserve: m(reserveLeft), idle: m(idle), deployedTotal: m(deployed), yieldRealized: m(0n),
    bufferAmount: m((P * 500n) / 10000n), ceilingAmount: m(ceiling), nextRungAt: 0, killed, killReason: w.killed ? w.killReason || 1 : afterDeadline ? 2 : 0,
    killReasonVi: w.killed ? "Một thành viên Hội đồng đã bấm công tắc." : afterDeadline ? "Công tắc tự bật khi tới hạn rút về." : null,
    coverage: m(RESERVE), exposureAtRisk: m(exposure), coverageOk: exposure <= RESERVE, faultTolerance: 1, bufferBps: 500, dayUnit: DAY, timeScale: w.scale,
    executed: w.executed,
    venues: [venue("venue_a", "Quỹ An Tâm", a, 8), venue("venue_b", "Quỹ Linh Hoạt", b, 6)],
    rungs, roster: Array.from({ length: 10 }, (_, i) => ({ account: `0x${(i + 1).toString(16).padStart(40, "0")}`, label: `Người nhận ${i + 1}`, amount: m(toBase(3000)), paid: w.executed })),
    agents: [], vaultCoversPayroll: idle >= P,
    guarantee: { ok: exposure <= RESERVE, coverage: m(RESERVE), exposureAtRisk: m(exposure), headroom: m(RESERVE - exposure), reasonVi: "Dù một nơi gửi bị kẹt, quỹ vẫn đủ trả lương." },
  };
}
