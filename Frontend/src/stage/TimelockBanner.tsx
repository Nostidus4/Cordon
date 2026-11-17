// Council timelock made visible (#77): 2/3 reached -> "chờ N giây rồi mới áp dụng", ticking, with the note that one member may still veto.
import { useEffect, useRef, useState } from "react";
import { useActions } from "../hooks/useActions";
import type { MemberId, Proposal } from "../types";
import { FaceAvatar, ToyButton } from "./ui";

/** Whole seconds left until `eta` (unix s) at wall-clock `nowMs`; rounds up so "0" only shows once it has really passed. */
export const secondsToEta = (eta: number, nowMs: number): number => Math.max(0, Math.ceil(eta - nowMs / 1000));

export function TimelockBanner({ proposal, vetoBy }: { proposal: Proposal; vetoBy?: { id: MemberId; name: string } }) {
  const actions = useActions();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  const seen = useRef(0); // the delay is the largest countdown seen (the banner mounts when the proposal is queued)
  if (proposal.eta == null) return null;
  const left = secondsToEta(proposal.eta, now);
  seen.current = Math.max(seen.current, left);
  const total = Math.max(1, seen.current);
  return (
    <div className="mt-3 rounded-[16px] p-3" style={{ background: "var(--amber-soft)", border: "2px solid var(--amber)" }} data-timelock={proposal.id} role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <div className="font-toy text-[16px] font-extrabold leading-tight" style={{ color: "var(--ink)" }}>
          Đã đủ 2/3 · chờ {total} giây rồi mới áp dụng
        </div>
        <div className="num shrink-0" style={{ fontSize: 34, color: "var(--amber-ink)" }} data-countdown>{left}s</div>
      </div>
      <div className="mt-1 text-[13.5px] font-bold" style={{ color: "var(--amber-ink)" }}>Một thành viên vẫn chặn được trong lúc chờ.</div>
      <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: "rgba(0,0,0,0.08)" }} aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, 100 - (left / total) * 100))}%`, background: "var(--amber)", transition: "width 250ms linear" }} />
      </div>
      {vetoBy ? (
        <div className="mt-2">
          <ToyButton size="xs" color="red" disabled={actions.veto.isPending} icon={<FaceAvatar member={vetoBy.id} size={22} />} onClick={() => actions.veto.mutate({ id: proposal.id, member: vetoBy.id })}>
            {vetoBy.name} phủ quyết
          </ToyButton>
        </div>
      ) : null}
    </div>
  );
}
