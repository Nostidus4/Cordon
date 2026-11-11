// Pick 1-2 people to "compromise": chips (keys 1/2/3 toggle). Default anh Minh.
import { motion } from "framer-motion";
import { Kbd, Tooltip, cn } from "../../components/ui";
import type { District } from "../../types";

export function PrincipalPicker({ people, selected, onToggle }: { people: District[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div data-tour="sim-picker" role="group" aria-label="Chọn người bị chiếm (tối đa 2)" className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[12px] text-muted">Nếu bị chiếm:</span>
      {people.map((p, i) => {
        const on = selected.includes(p.principalId);
        return (
          <Tooltip key={p.principalId} content={on ? (selected.length === 1 ? "Phải chọn ít nhất 1 người" : "Bỏ khỏi giả lập") : selected.length >= 2 ? "Chọn tối đa 2 người, người chọn trước sẽ được thay" : "Thêm vào giả lập"}>
            <button type="button" role="checkbox" aria-checked={on} onClick={() => onToggle(p.principalId)}
              className={cn("relative flex items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3 text-[13.5px] font-semibold transition-colors", on ? "border-bad/60 text-text" : "border-line bg-white/4 text-muted hover:border-line-strong hover:text-text")}>
              {on ? <motion.span layoutId="picker-bg" className="absolute inset-0 -z-0 rounded-full bg-bad-soft shadow-[var(--shadow-glow-bad)]" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
              <span className={cn("relative z-10 grid size-7 place-items-center rounded-full text-[12px] font-bold", on ? "bg-bad text-[#2b0710]" : "bg-white/10")}>{p.label.split(" ").pop()?.[0]}</span>
              <span className="relative z-10">{p.label}</span>
              <span className="relative z-10 flex items-center gap-1.5">{on ? <b aria-hidden className="text-bad">✕</b> : null}<Kbd>{i + 1}</Kbd></span>
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}
