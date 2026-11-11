// Bottom box: "Bạn nghĩ anh Minh chỉ cầm: 20.000/ngày" + "Thử xem →" (opens Simulate with that person). After the fix it confirms the claim became true.
import { ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AnimatedNumber, Button, cn } from "../../components/ui";
import { casual } from "../../graph/names";
import { useUiStore } from "../../store/uiStore";
import type { District, GraphSnapshot } from "../../types";

/** What the owner believes: the shared cap when there is one, otherwise the human card's own cap. */
export function youThinkOf(snap: GraphSnapshot, d: District): bigint {
  if (d.dailyCap) return BigInt(d.dailyCap.raw);
  return d.keys.reduce((s, k) => { const n = snap.nodes.find((x) => x.id === `k:${k}`); return n?.data.kind === "HUMAN" ? s + BigInt(n.data.keyDailyCap?.raw ?? "0") : s; }, 0n);
}

export function YouThinkBox({ snapshot, principalId, fixed, className }: { snapshot: GraphSnapshot; principalId: string; fixed: boolean; className?: string }) {
  const navigate = useNavigate();
  const setSelected = useUiStore((s) => s.setSelectedPrincipals);
  const d = snapshot.districts.find((x) => x.principalId === principalId);
  if (!d) return null;
  const n = Number(youThinkOf(snapshot, d) / 1_000_000n);
  const go = () => { setSelected([principalId]); navigate(`/simulate?p=${principalId}`); };
  return (
    <div className={cn("glass flex items-center gap-4 rounded-2xl py-2.5 pl-4 pr-2.5", fixed ? "border-ok/40" : "border-brand/45 shadow-[var(--shadow-glow-brand)]", className)}>
      <div className="leading-tight">
        <p className="text-[12.5px] text-muted">{fixed ? <>Sau khi sửa, <b className="text-text">{casual(d.label)}</b> chỉ cầm được tối đa</> : <>Bạn nghĩ <b className="text-text">{casual(d.label)}</b> chỉ cầm:</>}</p>
        <p className="mt-0.5 flex items-baseline gap-1.5">
          <span className="text-[26px] font-bold tracking-tight text-text"><AnimatedNumber value={n} /></span>
          <span className="text-[13px] text-faint">/ngày</span>
          {fixed ? <span className="ml-1 whitespace-nowrap text-[12px] font-semibold text-ok">✓ đúng như bạn nghĩ</span> : <span className="ml-1 whitespace-nowrap text-[12px] text-warn">▲ nhưng thật không?</span>}
        </p>
      </div>
      <Button variant={fixed ? "secondary" : "primary"} size="md" onClick={go} icon={<ArrowRight className="order-last size-4" />}>{fixed ? "Giả lập lại" : "Thử xem"}</Button>
    </div>
  );
}
