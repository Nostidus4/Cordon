// Persistent disclosure on the stage when the chain is simulated in the browser (Pages demo).
import { Link } from "react-router-dom";
import { FlaskConical } from "lucide-react";
import { SIM_PILL } from "../config/brand";

export function SimPill({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link to="/bang-chung" title={SIM_PILL.title} onClick={onNavigate} data-slot="sim-pill"
      className="toy-card inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-1.5 font-toy text-[13px] font-bold no-underline"
      style={{ borderRadius: 999, color: "var(--ink-2)", borderWidth: 2, background: "var(--cream, #fff7e6)" }}>
      <FlaskConical size={15} strokeWidth={2.6} aria-hidden />{SIM_PILL.label}
    </Link>
  );
}
