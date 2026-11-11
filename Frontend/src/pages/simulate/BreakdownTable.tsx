// Per-district breakdown: how much each affected district contributes, and whether the chain actually enforces it.
import { motion } from "framer-motion";
import { Card, CardHeader, Money, Tooltip, cn } from "../../components/ui";
import { casual } from "../../graph/names";
import { fmtDisplay } from "../../lib/format";
import type { District, SimResultCore } from "../../types";

export function BreakdownTable({ rows, totals, districts, onFocus, ready }: {
  rows: SimResultCore["perDistrict"]; totals: SimResultCore["totals"]; districts: District[]; onFocus: (pid: string) => void; ready: boolean;
}) {
  const label = (pid: string) => districts.find((d) => d.principalId === pid)?.label ?? pid;
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-5 pt-4"><CardHeader title="Chi tiết theo khu" en="Mỗi khu góp bao nhiêu vào mức mất tối đa" className="mb-3" /></div>
      <table className="w-full text-left text-[13.5px]">
        <thead className="border-y border-line bg-white/3 text-[11px] font-semibold uppercase tracking-wider text-faint">
          <tr><th className="px-5 py-2.5">Khu</th><th className="px-3 py-2.5 text-right">Đã khoá chặt</th><th className="px-3 py-2.5 text-right">Ước tính</th><th className="px-5 py-2.5">Nguồn &amp; ghi chú</th></tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const onchain = BigInt(r.enforced.raw) > 0n;
            return (
              <motion.tr key={r.principalId} initial={{ opacity: 0, x: -8 }} animate={{ opacity: ready ? 1 : 0.35, x: 0 }} transition={{ delay: 0.05 * i }}
                className="cursor-pointer border-b border-line/60 transition-colors hover:bg-white/5 focus-within:bg-white/5" onClick={() => onFocus(r.principalId)}>
                <td className="px-5 py-3"><button type="button" onClick={(e) => { e.stopPropagation(); onFocus(r.principalId); }} className="font-semibold text-text underline-offset-2 hover:underline">{label(r.principalId)}</button></td>
                <td className="px-3 py-3 text-right"><Money value={r.enforced} size="sm" tone={onchain ? "ok" : "muted"} /></td>
                <td className="px-3 py-3 text-right"><Money value={r.estimated} size="sm" tone="bad" /></td>
                <td className="px-5 py-3">
                  <Tooltip content={r.note}><span tabIndex={0} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] font-semibold", onchain ? "border-ok/35 bg-ok-soft text-ok" : "border-dashed border-sim/55 bg-sim/10 text-sim")}>
                    <span aria-hidden>{onchain ? "✓" : "◇"}</span> {onchain ? "trên chain" : "tự khai"}
                  </span></Tooltip>
                  <span className="ml-2 text-[12.5px] text-muted">{r.note}</span>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-white/3 font-semibold">
            <td className="px-5 py-3 text-text">Tổng, {casual(rows.map((r) => label(r.principalId)).slice(0, 1)[0] ?? "")}{rows.length > 1 ? ` và ${rows.length - 1} khu nữa` : ""}</td>
            <td className="px-3 py-3 text-right tnum text-ok">{fmtDisplay(BigInt(totals.enforced.raw))}</td>
            <td className="px-3 py-3 text-right tnum text-bad">{fmtDisplay(BigInt(totals.estimated.raw))}</td>
            <td className="px-5 py-3 text-[12.5px] font-normal text-muted">tối đa mỗi ngày, giới hạn bởi số dư Kho chi tiêu {fmtDisplay(BigInt(totals.vaultBalance.raw))}</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}
