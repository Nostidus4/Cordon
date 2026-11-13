// Scene 2 · Thử (spec §10.3, B1/B2): red spreads from the compromised person; the counter climbs from "Bạn nghĩ" to "Rủi ro thật".
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGraph } from "../../hooks/useGraph";
import { useSimulate } from "../../hooks/useSimulate";
import { fmtPercent } from "../../lib/format";
import { useUiStore } from "../../store/uiStore";
import type { CityStageProps } from "../contract";
import { buildSpreadPlan, counterAfter, spreadProp } from "../logic";
import { AssistantBubble, Tile } from "../parts";
import { useCityProps, usePrimaryAction } from "../stageStore";
import { Counter, PersonIcon, Ribbon, ToyButton, ToyCard, useReduced, WarnIcon, CheckIcon } from "../ui";

const WHO: { id: string; label: string }[] = [{ id: "minh", label: "Anh Minh" }, { id: "huy", label: "Anh Huy" }];
export const SPREAD_START_MS = 500;

export function TryScene() {
  const nav = useNavigate();
  const reduced = useReduced();
  const { data: graph } = useGraph();
  const selected = useUiStore((s) => s.selectedPrincipals);
  const toggle = useUiStore((s) => s.togglePrincipal);
  const highlight = useUiStore((s) => s.highlight);
  const clearHighlight = useUiStore((s) => s.clearHighlight);
  const { data: sim, isPlaceholderData } = useSimulate(selected);
  const [nonce, setNonce] = useState(0);

  useEffect(() => { clearHighlight(); return () => useUiStore.getState().clearHighlight(); }, [clearHighlight]);
  // dev-only: ?who=minh,huy
  useEffect(() => {
    const w = import.meta.env.DEV ? new URLSearchParams(window.location.search).get("who") : null;
    if (w) useUiStore.getState().setSelectedPrincipals(w.split(",").slice(0, 2));
  }, []);

  const plan = useMemo(() => (sim && graph && !isPlaceholderData ? buildSpreadPlan(sim, graph, selected) : null), [sim, graph, selected, isPlaceholderData]);
  const [stepsDone, setStepsDone] = useState(0);
  useEffect(() => {
    setStepsDone(0);
    if (!plan) return;
    if (reduced) { setStepsDone(plan.steps.length); return; }
    const timers = plan.steps.map((s) => setTimeout(() => setStepsDone(s.index + 1), SPREAD_START_MS + s.at));
    return () => timers.forEach(clearTimeout);
  }, [plan, nonce, reduced]);

  const counter = plan ? counterAfter(plan, stepsDone) : sim ? BigInt(sim.totals.youThink.raw) : 0n;
  const done = !!plan && stepsDone >= plan.steps.length;
  const toNum = (b: bigint) => Number(b / 1_000_000n);

  const city = useMemo<Partial<CityStageProps>>(() => ({
    shot: "district-minh", showDomain: true,
    spread: plan && graph && sim ? spreadProp(graph, sim, selected, stepsDone) : undefined,
    highlight: highlight.nodeIds.length || highlight.edgeIds.length ? { ...highlight, tone: "amber" } : undefined,
  }), [plan, graph, sim, selected, stepsDone, highlight]);
  useCityProps(city);
  const next = () => nav("/s/fix");
  usePrimaryAction(done ? next : () => setNonce((n) => n + 1));

  const t = sim?.totals;
  const names = selected.map((id) => WHO.find((w) => w.id === id)?.label ?? id).join(" + ");
  return (
    <>
      <div className="absolute bottom-12 left-6" data-slot="scene-left">
        <ToyCard className="w-[min(480px,calc(100vw-48px))] px-6 pb-6 pt-5" label="Nếu bị chiếm thì mất bao nhiêu">
          <Ribbon scene="try">Cảnh 2 · Thử</Ribbon>
          <div className="toy-eyebrow mb-2 mt-1" style={{ fontSize: 17 }}>Nếu bị chiếm thì sao?</div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn người bị chiếm">
            {WHO.map((w) => (
              <button key={w.id} type="button" className="toy-chip" aria-pressed={selected.includes(w.id)} onClick={() => toggle(w.id)}>
                <PersonIcon size={30} color={w.id === "minh" ? "#ff9a55" : "#4d8cf5"} />{w.label}
                {selected.includes(w.id) ? <CheckIcon size={15} color="var(--violet-d)" /> : null}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-3">
            <Tile label="Rủi ro thật" tone="red" foot={<>{t ? fmtPercent(t.percentOfMainTreasury) : "…"} quỹ chính · gồm quan hệ tự khai, chưa kiểm chứng</>}>
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0" style={{ color: "var(--red-ink)" }}>
                <Counter value={toNum(counter)} className="num" style={{ fontSize: "clamp(40px, 3.7vw, 54px)", color: "var(--red-ink)" }} duration={0.35} tick="up" />
                <span className="font-toy text-[18px] font-bold">/ngày</span>
              </div>
            </Tile>
            <div className="flex flex-col gap-3">
              <Tile label="Bạn nghĩ"><span className="num" style={{ fontSize: "clamp(22px, 2vw, 28px)" }}>{t?.youThink.display ?? "…"}</span></Tile>
              <Tile label="Chain chặn" tone="teal"><span className="num flex items-center gap-1.5" style={{ fontSize: "clamp(22px, 2vw, 28px)", color: "var(--teal-ink)" }}><CheckIcon size={19} />{t?.enforced.display ?? "…"}</span></Tile>
            </div>
          </div>
          <p className="toy-body mb-0 mt-3 flex items-start gap-1.5" style={{ minHeight: 40 }}>
            <WarnIcon size={15} color="var(--amber-ink)" />
            <span>{done ? <>Nếu <b>{names}</b> bị chiếm, kẻ gian có thể lấy tới <b>{t?.estimated.display}</b> mỗi ngày.</> : "Đỏ đang lan qua các thẻ…"}</span>
          </p>
          <div className="mt-3 flex items-center gap-3">
            <ToyButton size="lg" pulse={done} onClick={next}>Sửa thế nào? →</ToyButton>
            <ToyButton color="cream" size="sm" onClick={() => setNonce((n) => n + 1)}>↻ Xem lại</ToyButton>
          </div>
        </ToyCard>
      </div>

      <div className="absolute right-6 top-24" data-slot="scene-right">
        <ToyCard className="w-[min(350px,calc(100vw-48px))] p-4" label="Trợ lý" delay={0.15}>
          <AssistantBubble questionIds={["huy_too", "why_flag", "how_fix"]} screen="simulate" principalIds={selected} devAskId={import.meta.env.DEV ? new URLSearchParams(window.location.search).get("ask") : null} />
        </ToyCard>
      </div>
    </>
  );
}
