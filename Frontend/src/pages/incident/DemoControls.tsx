// Run agent · Start attack · Lock district · Try locked card (demoMode, spec §10.5). The next recommended step pulses.
import { Bot, ChevronRight, Lock, ShieldAlert, Swords } from "lucide-react";
import { Button, cn } from "../../components/ui";
import { NextPulse } from "./NextPulse";

export type Stage = "agent" | "attack" | "attacking" | "lock" | "step7" | "done";
export interface DemoControlsProps {
  stage: Stage;
  done: { agent: boolean; attack: boolean; lock: boolean; step7: boolean };
  policyActive: boolean;
  busy: { agent: boolean; attack: boolean; lock: boolean; step7: boolean };
  onAgent: () => void; onAttack: () => void; onLock: () => void; onStep7: () => void;
}

export function DemoControls({ stage, done, policyActive, busy, onAgent, onAttack, onLock, onStep7 }: DemoControlsProps) {
  const needV2 = policyActive ? undefined : "Cần áp dụng policy v2 trước";
  const items = [
    { id: "agent", n: 1, label: "Chạy agent buổi sáng", icon: <Bot className="size-4" aria-hidden />, done: done.agent, next: stage === "agent", on: onAgent, loading: busy.agent, dis: !policyActive || busy.attack, why: needV2 },
    { id: "attack", n: 2, label: "Bắt đầu tấn công", icon: <Swords className="size-4" aria-hidden />, done: done.attack, next: stage === "attack", on: onAttack, loading: busy.attack || stage === "attacking", dis: !policyActive || stage === "attacking" || done.lock, why: needV2 },
    { id: "lock", n: 3, label: "Khoá khu anh Minh", icon: <Lock className="size-4" aria-hidden />, done: done.lock, next: stage === "lock", on: onLock, loading: busy.lock, dis: done.lock || stage === "attacking", why: "Khu đã khoá" },
    { id: "step7", n: 4, label: "Thử gửi bằng thẻ đã khoá", icon: <ShieldAlert className="size-4" aria-hidden />, done: done.step7, next: stage === "step7", on: onStep7, loading: busy.step7, dis: !done.lock, why: "Khoá khu trước" },
  ];
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Điều khiển demo" data-tour="inc-controls">
      <span className="mr-2 whitespace-nowrap rounded-md border border-warn/40 bg-warn-soft px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-warn">demo</span>
      {items.map((it, i) => (
        <div key={it.id} className="flex items-center gap-1">
          {i > 0 ? <ChevronRight className="size-3.5 text-faint" aria-hidden /> : null}
          <NextPulse on={it.next && !it.dis}>
            <Button size="sm" variant={it.id === "lock" ? "danger" : it.next ? "primary" : "secondary"} disabled={it.dis} disabledReason={it.dis ? it.why : undefined} loading={it.loading} onClick={it.on}
              icon={it.done ? <span aria-hidden className="text-ok">✓</span> : it.icon} className={cn(it.done && it.id !== "lock" && "border-ok/40")} data-demo-step={it.id}>
              <span className="tnum text-[11px] opacity-70">{it.n}</span>{it.label}
            </Button>
          </NextPulse>
        </div>
      ))}
    </div>
  );
}
