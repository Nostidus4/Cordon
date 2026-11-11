// Translate calls[] into plain Vietnamese (describe lines) with a small technical chip per call.
import { motion } from "framer-motion";
import { Gauge, KeyRound, LandPlot, ScrollText, Wrench } from "lucide-react";
import type { Call } from "../../types";
import { callKind, type CallKind } from "./logic";

const ICON: Record<CallKind, typeof Gauge> = { cap: Gauge, move: KeyRound, create: LandPlot, bump: ScrollText, other: Wrench };

export function CallsInPlainWords({ calls, describe }: { calls: Call[]; describe: string[] }) {
  const lines = describe.map((text, i) => ({ text, call: calls[i] }));
  return (
    <ol className="@container space-y-1.5" data-tour="req-changes">
      {lines.map(({ text, call }, i) => {
        const Icon = ICON[call ? callKind(call.fn) : "other"];
        return (
          <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 * i, duration: 0.3 }}
            className="flex items-start gap-3 rounded-[var(--radius-sm)] border border-line bg-white/[0.025] px-3 py-2">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-brand-soft text-brand"><Icon className="size-3.5" aria-hidden /></span>
            <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-text">{text}</span>
            {call ? <code className="mt-0.5 hidden shrink-0 rounded bg-white/6 px-1.5 py-0.5 font-mono text-[10.5px] text-faint @[600px]:inline">{call.target}.{call.fn}</code> : null}
          </motion.li>
        );
      })}
    </ol>
  );
}
