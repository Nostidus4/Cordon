// Verifiable risk-report hash chip: "bằng chứng: 0x…" (spec §6.5 riskReportHash, §8.5). Click = copy + re-verify.
import { useEffect, useState } from "react";
import { Check, Copy, Fingerprint } from "lucide-react";
import { Tooltip, cn } from "../../components/ui";
import { shortHash } from "../../lib/format";
import { hashReport } from "./logic";
import type { RiskReport } from "../../types";

export function RiskHashChip({ report, hash: given, className }: { report: RiskReport; hash?: string; className?: string }) {
  const [computed, setHash] = useState<string | null>(null);
  const hash = given ?? computed;
  const [copied, setCopied] = useState(false);
  const key = JSON.stringify([report.before, report.after, report.graphVersion, report.findingsBefore.length, report.findingsAfter.length]);
  useEffect(() => { if (given) return; let on = true; void hashReport(report).then((h) => on && setHash(h)); return () => { on = false; }; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const copy = async () => {
    if (!hash) return;
    try { await navigator.clipboard.writeText(hash); } catch { /* clipboard may be blocked */ }
    setCopied(true); setTimeout(() => setCopied(false), 1400);
  };
  return (
    <Tooltip content={<span className="block max-w-80">Băm chuẩn hoá của báo cáo rủi ro (bỏ <code>generatedAt</code>), đi kèm đề xuất để ai cũng kiểm lại được.<br /><span className="font-mono break-all text-faint">{hash ?? "…"}</span><br /><span className="text-faint">Bản demo dùng SHA-256 trong trình duyệt; contract lưu keccak256 của cùng JSON.</span></span>}>
      <button type="button" onClick={copy} disabled={!hash}
        className={cn("inline-flex items-center gap-1.5 rounded-full border border-sim/45 bg-sim/10 px-2.5 py-1 text-[11.5px] font-semibold text-sim transition-colors hover:bg-sim/20", className)}>
        <Fingerprint className="size-3.5" aria-hidden />
        <span>bằng chứng:</span> <span className="font-mono font-normal text-[#d9c9ff]">{hash ? shortHash(hash, 8, 6) : "đang tính…"}</span>
        {copied ? <Check className="size-3.5 text-ok" aria-hidden /> : <Copy className="size-3 opacity-60" aria-hidden />}
        <span className="sr-only">{copied ? "Đã chép" : "Chép băm"}</span>
      </button>
    </Tooltip>
  );
}
