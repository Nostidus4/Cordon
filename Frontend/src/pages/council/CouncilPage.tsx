// Council (spec §10.6): members + their districts, history of tighten/loosen actions, "Dừng cả kho" (demoMode), vault status.
import { useEffect } from "react";
import { Activity, PauseCircle } from "lucide-react";
import { Money, StatusChip } from "../../components/ui";
import { useGraph } from "../../hooks/useGraph";
import { useHealth } from "../../hooks/useHealth";
import { useOrg } from "../../hooks/useOrg";
import { useUiStore } from "../../store/uiStore";
import { ActionHistory } from "./ActionHistory";
import { MemberList } from "./MemberList";
import { PauseAllButton } from "./PauseAllButton";
import { Principle } from "./Principle";
import { policyLabel } from "../../lib/policy";

function VaultStatus() {
  const { data: org } = useOrg();
  const { data: graph } = useGraph();
  const { data: health } = useHealth();
  const demoMode = useUiStore((s) => s.demoMode);
  const paused = graph?.nodes.find((n) => n.id === "vault")?.data.paused === true;
  return (
    <section aria-labelledby="vault-title" className="glass flex items-center gap-5 rounded-[var(--radius-lg)] p-4" data-tour="council-vault">
      <span className={paused ? "grid size-12 shrink-0 place-items-center rounded-full bg-bad-soft text-bad" : "grid size-12 shrink-0 place-items-center rounded-full bg-ok-soft text-ok"} aria-hidden>
        {paused ? <PauseCircle className="size-6" /> : <Activity className="size-6" />}
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="vault-title" className="text-[12px] font-semibold uppercase tracking-wider text-faint">Trạng thái kho chi tiêu</h2>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          {paused ? <StatusChip status="bad">Đã dừng · mọi thẻ ngừng chi</StatusChip> : <StatusChip status="ok">Đang hoạt động</StatusChip>}
          <span className="text-[12.5px] text-muted">tUSDC trong kho <Money value={org?.vault.usdc} size="sm" className="ml-1" /></span>
          <span className="text-[12.5px] text-muted">tTKB <Money value={org?.vault.tkb} size="sm" className="ml-1" /></span>
          <span className="text-[12.5px] text-muted">chính sách <b className="text-text">v{policyLabel(health) ?? "…"}</b></span>
        </div>
        <p className="mt-1 text-[11.5px] text-faint">{paused ? "Mở lại kho là hành động nới: cần 2/3 thành viên." : "Dừng kho chỉ cần một thành viên; mở lại cần 2/3."}</p>
      </div>
      {demoMode ? <PauseAllButton paused={paused} /> : null}
    </section>
  );
}

export default function CouncilPage() {
  useEffect(() => { if (import.meta.env.DEV) void import("../incident/devAutoplay").then((m) => m.runDevAutoplay()); }, []);
  return (
    <div className="-mb-6 -mt-4 flex flex-col gap-3 pb-2" style={{ height: "calc(100vh - var(--chrome-h) - 9px)" }}>
      <div className="flex items-baseline gap-3">
        <h1 className="text-[26px] font-bold leading-tight tracking-tight text-text">Hội đồng</h1>
        <span className="rounded-md border border-line px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-faint">Council</span>
        <p className="truncate text-[13px] text-muted">Ba người giữ chìa khoá cuối cùng của kho chi tiêu.</p>
      </div>
      <Principle />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4">
        <MemberList />
        <div className="flex min-h-0 flex-col gap-3">
          <VaultStatus />
          <ActionHistory />
        </div>
      </div>
    </div>
  );
}
