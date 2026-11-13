// Card tile with last attempt status, grey when locked. Blocked = shake + red flash, accepted = teal pulse (respects reduced motion).
import { Bot, Lock, Server, User } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { KeyKind } from "../../types";
import { stepOf } from "../../lib/dto";
import { reasonVi } from "../../shared/reasonCodes";
import { cn } from "../../components/ui";
import type { Tile } from "./incidentView";

export const KindIcon = ({ kind, className }: { kind: KeyKind; className?: string }) =>
  kind === "HUMAN" ? <User className={className} aria-hidden /> : kind === "AGENT" ? <Bot className={className} aria-hidden /> : <Server className={className} aria-hidden />;
const KIND_TEXT: Record<KeyKind, string> = { HUMAN: "người", AGENT: "AI", SERVICE: "phần mềm" };

const verb = (k: string | undefined) => (k === "swap" ? "đổi" : "chi");

export function CardTile({ tile, index }: { tile: Tile; index: number }) {
  const reduce = useReducedMotion();
  const { meta, last, status, rejected } = tile;
  const locked = status === "locked";
  const ok = status === "ok", blocked = status === "blocked";
  const amount = last?.amount?.display;
  return (
    <motion.div
      key={`${last?.id ?? "none"}-${status}`}
      data-status={status}
      className={cn(
        "relative flex h-full min-h-[80px] flex-col overflow-hidden rounded-[var(--radius-md)] border px-3 py-2.5 transition-colors duration-500",
        status === "idle" && "border-line bg-white/[0.03]",
        ok && "border-ok/45 bg-ok-soft",
        blocked && "border-bad/60 bg-bad-soft",
        locked && "border-lock/35 bg-lock-soft",
      )}
      style={{ transitionDelay: locked ? `${index * 110}ms` : undefined }}
      initial={ok && !reduce ? { boxShadow: "0 0 0 0 rgb(52 224 180 / 0.7)" } : { x: 0 }}
      animate={reduce ? undefined : ok ? { boxShadow: ["0 0 0 0 rgb(52 224 180 / 0.7)", "0 0 0 10px rgb(52 224 180 / 0)"], scale: [1, 1.035, 1] }
        : blocked ? { x: [0, -9, 9, -7, 7, -3, 3, 0] } : undefined}
      transition={{ duration: blocked ? 0.5 : 0.9, ease: "easeOut" }}
    >
      {blocked ? <motion.span aria-hidden className="pointer-events-none absolute inset-0 bg-bad" initial={{ opacity: reduce ? 0 : 0.55 }} animate={{ opacity: 0 }} transition={{ duration: 0.8 }} /> : null}
      {locked ? <span aria-hidden className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_7px,rgb(255_255_255/0.05)_7px_14px)]" /> : null}
      <div className="relative flex items-center gap-2">
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", locked ? "bg-lock/20 text-lock" : ok ? "bg-ok/20 text-ok" : blocked ? "bg-bad/20 text-bad" : "bg-white/8 text-muted")}>
          {locked ? <Lock className="size-4" aria-hidden /> : <KindIcon kind={meta.kind} className="size-4" />}
        </span>
        <div className="min-w-0 leading-tight">
          <p className={cn("line-clamp-2 text-[12.5px] font-semibold leading-[1.15]", locked ? "text-lock" : "text-text")}>{meta.label}</p>
          
        </div>
      </div>
      <div className="relative mt-auto pt-2 text-[11.5px] font-medium leading-snug">
        {locked ? (
          <>
            <p className="text-lock"><span aria-hidden>◐</span> đã gạch khỏi chain</p>
            {rejected ? <p className="mt-0.5 font-semibold text-bad"><span aria-hidden>✕</span> bị chain từ chối</p> : null}
          </>
        ) : status === "idle" ? <p className="text-faint">chưa có lần thử</p>
          : ok ? <p className="text-ok"><span aria-hidden>✓</span> {verb(last?.action)} {amount ? <b className="tnum">{amount}</b> : "được"}{last && stepOf(last) === 0 ? " · buổi sáng" : ""}</p>
          : <p className="text-bad"><span aria-hidden>✕</span> {reasonVi(last?.reasonCode)}</p>}
      </div>
    </motion.div>
  );
}
