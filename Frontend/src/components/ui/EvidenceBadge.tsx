import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { AttemptOutcome } from "../../types";
import { REASONS, type ReasonCode } from "../../shared/reasonCodes";
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
  reasonCode?: ReasonCode | null;
  className?: string;
}
const base = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold";

/** Spec §10.1: real tx -> "✓ giao dịch thật" (explorer, new tab) · simulated -> "mô phỏng" · revert (mined, status 0) -> "bị chain từ chối (revert)" · BLOCKED_AT_PROTOCOL (no hash) -> "bị chain từ chối". */
const NO_EXPLORER = "Chưa có trang explorer cho chain này. Kiểm bằng cast receipt · trang Bằng chứng.";

/** Hash chip without an explorer link: click copies the hash, tooltip says how to verify it. */
function HashChip({ hash, cls, children, note }: { hash: string; cls: string; children: React.ReactNode; note: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { void navigator.clipboard?.writeText(hash).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => undefined); };
  return (
    <Tooltip content={<span className="block max-w-72"><span className="font-mono break-all">{hash}</span><br /><span className="font-sans text-faint">{note} {NO_EXPLORER}</span></span>}>
      <button type="button" onClick={copy} className={cn(cls, "cursor-copy")} aria-label={`Sao chép mã giao dịch ${hash}`}>
        {children}<span className="font-sans font-normal opacity-80">{copied ? "đã chép" : "chép"}</span>
      </button>
    </Tooltip>
  );
}

export function EvidenceBadge({ txHash, simulated, outcome, errorRaw, reasonCode, className }: EvidenceBadgeProps) {
  if (outcome === "blocked_at_protocol" || (!txHash && errorRaw)) {
    const short = errorRaw ? errorRaw.replace(/^rpc error -?\d+: /, "").slice(0, 80) : "Thẻ đã bị gạch khỏi chain";
    return (
      <Tooltip content={<span className="block max-w-72">{short}{errorRaw && errorRaw.length > 80 ? "…" : ""}<br /><span className="text-faint">Không có tx hash: node từ chối trước khi vào block.</span></span>}>
        <span tabIndex={0} className={cn(base, "border-bad/45 bg-bad-soft text-bad", className)}><span aria-hidden>✕</span> bị chain từ chối</span>
      </Tooltip>
    );
  }
  if (txHash && outcome === "reverted" && !simulated) {
    const url = txUrl(txHash);
    const code = reasonCode ? REASONS[reasonCode]?.error : null;
    const cls = cn(base, "border-bad/45 bg-bad-soft text-bad", className);
    const inner = <><span aria-hidden>✕</span> bị chain từ chối (revert) <span className="font-mono font-normal opacity-80">{shortHash(txHash, 6, 4)}</span></>;
    const note = `Giao dịch đã vào block nhưng contract revert${code ? ` (${code})` : ""}.`;
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" className={cn(cls, "hover:brightness-125")}>{inner}<ExternalLink className="size-3" aria-hidden /><span className="sr-only">(mở explorer ở tab mới)</span></a>
    ) : <HashChip hash={txHash} cls={cls} note={note}>{inner} </HashChip>;
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
  const url = txUrl(txHash);
  if (!url) {
    return <HashChip hash={txHash} cls={cn(base, "border-ok/40 bg-ok-soft text-ok", className)} note="Giao dịch thật đã lên chain."><span aria-hidden>✓</span> giao dịch thật <span className="font-mono font-normal opacity-80">{shortHash(txHash, 6, 4)}</span> </HashChip>;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className={cn(base, "border-ok/40 bg-ok-soft text-ok hover:brightness-125", className)}>
      <span aria-hidden>✓</span> giao dịch thật <span className="font-mono font-normal opacity-80">{shortHash(txHash, 6, 4)}</span><ExternalLink className="size-3" aria-hidden />
      <span className="sr-only">(mở explorer ở tab mới)</span>
    </a>
  );
}
