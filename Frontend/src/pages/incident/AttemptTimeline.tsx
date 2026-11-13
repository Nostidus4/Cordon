// Timeline: time, card, action in plain words, ✓/✕ + VI reason + evidence badge (spec §10.5).
import { useEffect, useRef } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ExternalLink } from "lucide-react";
import type { Attempt } from "../../types";
import { attemptLabel, stepOf } from "../../lib/dto";
import { REASONS, reasonVi } from "../../shared/reasonCodes";
import { EvidenceBadge, Tooltip, cn } from "../../components/ui";
import { shortHash } from "../../lib/format";
import { txUrl } from "../../lib/explorer";
import { SCENE4_STEPS } from "../../shared/scenario4";

const WHO = {
  agent: { text: "agent", title: "agent thật (không phải kẻ gian)", cls: "bg-brand-soft text-[#c9c2ff]" },
  attacker: { text: "kẻ gian", title: "kẻ gian cầm khoá bị chiếm", cls: "bg-bad-soft text-bad" },
  council: { text: "Hội đồng", title: "Hội đồng · siết chỉ cần 1 người", cls: "bg-ok-soft text-ok" },
} as const;

/** "rpc error -32000: cannot send transaction: address 0x… is not on the TxAllowList" -> short form */
const shortRpc = (raw: string | null) => {
  if (!raw) return "RPC từ chối: không có trong Tx AllowList";
  const code = raw.match(/rpc error (-?\d+)/i)?.[1];
  return `RPC ${code ?? ""}: ${/TxAllowList/i.test(raw) ? "không có trong Tx AllowList" : raw.replace(/^rpc error -?\d+:\s*/i, "").slice(0, 60)}`.replace("RPC :", "RPC:");
};

/** A reverted tx is mined (it has a hash) but the ✕ must not read as "✓ giao dịch thật": own red proof chip. */
function RevertProof({ a }: { a: Attempt }) {
  const err = a.reasonCode ? REASONS[a.reasonCode].error : null;
  const url = a.txHash && !a.simulated ? txUrl(a.txHash) : null;
  const inner = (
    <>
      <span aria-hidden>↩</span> revert
      {a.txHash ? <span className="font-mono font-normal opacity-75">{a.simulated ? "◇ " : ""}{shortHash(a.txHash, 5, 3)}</span> : null}
      {url ? <ExternalLink className="size-3" aria-hidden /> : null}
    </>
  );
  const cls = "inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-bad/40 bg-bad-soft px-2 py-0.5 text-[11px] font-semibold text-bad";
  return url ? <a href={url} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
    : <Tooltip content={<span className="font-mono">{err ? `${err}()` : a.errorRaw}<br />{a.txHash}<br /><span className="font-sans text-faint">{a.simulated ? "Giao dịch mô phỏng, chưa lên chain thật." : "Giao dịch đã vào block nhưng bị contract revert."}</span></span>}><span tabIndex={0} className={cls}>{inner}</span></Tooltip>;
}

function Row({ a, latest, agentNote }: { a: Attempt; latest: boolean; agentNote?: string }) {
  const reduce = useReducedMotion();
  const who = SCENE4_STEPS.find((s) => s.step === a.step)?.who ?? "attacker";
  const ok = a.outcome === "ok", blocked = a.outcome === "blocked_at_protocol";
  return (
    <motion.li layout={!reduce} initial={reduce ? false : { opacity: 0, x: 18, scale: 0.97 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ type: "spring", stiffness: 340, damping: 28 }}
      data-step={stepOf(a)} data-outcome={a.outcome}
      className={cn("relative grid grid-cols-[48px_1fr] gap-x-2.5 rounded-[var(--radius-md)] border px-2.5 py-[3px]",
        ok ? "border-ok/20 bg-ok-soft/40" : "border-bad/30 bg-bad-soft/50", latest && (ok ? "border-ok/55" : "border-bad/60"))}>
      <div className="flex flex-col items-center gap-1 pt-0.5" title={`bước ${stepOf(a)}`}>
        <span className="tnum text-[11px] font-semibold text-faint">{a.displayTime}</span>
        <span title={WHO[who].title} className={cn("whitespace-nowrap rounded px-1 text-[9.5px] font-semibold leading-[14px]", WHO[who].cls)}>{WHO[who].text}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[12.5px] leading-snug text-muted">
          <span className="mr-1.5 text-[13px] font-semibold text-text">{a.signerLabel}</span>
          {attemptLabel(a)}
        </p>
        {agentNote ? <p className="mt-1 border-l-2 border-brand/60 pl-2 text-[12px] italic leading-snug text-[#cfc9ff]">“{agentNote}”</p> : null}
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-semibold", ok ? "text-ok" : "text-bad")}>
            <span aria-hidden className={cn("grid size-[17px] shrink-0 place-items-center rounded-full text-[10px] font-bold", ok ? "bg-ok text-[#04261d]" : "bg-bad-strong text-white")}>{ok ? "✓" : "✕"}</span>
            {ok ? (a.action === "lock" ? "Đã khoá khu" : "Được chi") : reasonVi(a.reasonCode) || "Bị chặn"}
          </span>
          {ok || blocked ? <EvidenceBadge txHash={a.txHash} simulated={a.simulated} outcome={a.outcome} errorRaw={a.errorRaw} /> : <RevertProof a={a} />}
        </div>
        {blocked ? <p className="mt-1 font-mono text-[10.5px] leading-snug text-bad/90">{shortRpc(a.errorRaw)} · không có tx hash</p> : null}
      </div>
    </motion.li>
  );
}

export function AttemptTimeline({ attempts, agentNote, empty }: { attempts: Attempt[]; agentNote?: string; empty?: string }) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [attempts.length]);
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-tour="inc-attempts">
      <div className="mb-1.5 flex items-baseline justify-between">
        <h4 className="text-[12px] font-semibold uppercase tracking-wider text-faint">Dòng thời gian các lần thử</h4>
        <span className="tnum text-[11px] text-faint">{attempts.length} lần</span>
      </div>
      <ol className="min-h-0 flex-1 space-y-[3px] overflow-y-auto pr-1" aria-live="polite" aria-label="Các lần thử">
        <AnimatePresence initial={false}>
          {attempts.map((a, i) => <Row key={a.id} a={a} latest={i === attempts.length - 1} agentNote={a.step === 0 ? agentNote : undefined} />)}
        </AnimatePresence>
        {attempts.length === 0 ? (
          <li className="grid h-full min-h-32 place-items-center rounded-[var(--radius-md)] border border-dashed border-line-strong px-4 text-center text-[13px] text-faint">{empty ?? "Chưa có lần thử nào."}</li>
        ) : null}
        <li ref={end} aria-hidden className="h-px" />
      </ol>
    </div>
  );
}
