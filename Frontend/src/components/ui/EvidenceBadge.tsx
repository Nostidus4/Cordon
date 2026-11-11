import { ExternalLink } from "lucide-react";
import type { AttemptOutcome } from "../../types";
import { shortHash } from "../../lib/format";
import { txUrl } from "../../lib/explorer";
import { cn } from "./cn";
import { Tooltip } from "./Tooltip";

export interface EvidenceBadgeProps {
  txHash?: string | null;
  /** tx is from the simulated chain (CHAIN_MODE=sim / mock): no explorer page */
  simulated?: boolean;
  outcome?: AttemptOutcome;
  errorRaw?: string | null;
  className?: string;
}
const base = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold";

/** Spec §10.1: real tx -> "✓ giao dịch thật" (explorer, new tab) · simulated -> "mô phỏng" · BLOCKED_AT_PROTOCOL -> "bị chain từ chối". */
export function EvidenceBadge({ txHash, simulated, outcome, errorRaw, className }: EvidenceBadgeProps) {
  if (outcome === "blocked_at_protocol" || (!txHash && errorRaw)) {
    const short = errorRaw ? errorRaw.replace(/^rpc error -?\d+: /, "").slice(0, 80) : "Thẻ đã bị gạch khỏi chain";
    return (
      <Tooltip content={<span className="block max-w-72">{short}{errorRaw && errorRaw.length > 80 ? "…" : ""}<br /><span className="text-faint">Không có tx hash: node từ chối trước khi vào block.</span></span>}>
        <span tabIndex={0} className={cn(base, "border-bad/45 bg-bad-soft text-bad", className)}><span aria-hidden>✕</span> bị chain từ chối</span>
      </Tooltip>
    );
  }
  if (!txHash) return null;
  if (simulated) {
    return (
      <Tooltip content={<span className="font-mono">{txHash}<br /><span className="font-sans text-faint">Giao dịch mô phỏng, chưa lên chain thật.</span></span>}>
        <span tabIndex={0} className={cn(base, "border-dashed border-sim/50 bg-sim/10 text-sim", className)}>
          <span aria-hidden>◇</span> mô phỏng <span className="font-mono font-normal opacity-80">{shortHash(txHash, 6, 4)}</span>
        </span>
      </Tooltip>
    );
  }
  return (
    <a href={txUrl(txHash) ?? "#"} target="_blank" rel="noreferrer" className={cn(base, "border-ok/40 bg-ok-soft text-ok hover:brightness-125", className)}>
      <span aria-hidden>✓</span> giao dịch thật <span className="font-mono font-normal opacity-80">{shortHash(txHash, 6, 4)}</span><ExternalLink className="size-3" aria-hidden />
      <span className="sr-only">(mở explorer ở tab mới)</span>
    </a>
  );
}
