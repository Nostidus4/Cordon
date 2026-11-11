// Scene 2, "Simulate" (spec §10.3, Epic B): pick who gets compromised, watch red spread through the same graph, read three numbers,
// ask the assistant, turn the finding into a fix proposal.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { AssistantPanel } from "../../components/assistant/AssistantPanel";
import { useDraftHandoff } from "../../components/assistant/useDraftHandoff";
import { GraphCanvas } from "../../components/graph/GraphCanvas";
import { GraphSkeleton } from "../../components/graph/GraphSkeleton";
import { Legend } from "../../components/graph/Legend";
import { Button, EmptyState, Kbd, cn } from "../../components/ui";
import { buildSpreadPlan } from "../../graph/spread";
import { useGraph } from "../../hooks/useGraph";
import { useSimulate } from "../../hooks/useSimulate";
import { useUiStore } from "../../store/uiStore";
import type { ProposedChange } from "../../types";
import { BreakdownTable } from "./BreakdownTable";
import { CreateProposalButton } from "./CreateProposalButton";
import { ExposureCounters } from "./ExposureCounters";
import { PrincipalPicker } from "./PrincipalPicker";
import { useSpreadAnimation } from "./useSpreadAnimation";

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
const QUESTIONS = ["huy_too", "why_flag", "how_fix"];

export default function SimulatePage() {
  const { data: graph, isLoading, isError, refetch, isFetching } = useGraph();
  const selected = useUiStore((s) => s.selectedPrincipals);
  const setSelected = useUiStore((s) => s.setSelectedPrincipals);
  const toggle = useUiStore((s) => s.togglePrincipal);
  const highlight = useUiStore((s) => s.highlight);
  const setHighlight = useUiStore((s) => s.setHighlight);
  const clearHighlight = useUiStore((s) => s.clearHighlight);
  const [params, setParams] = useSearchParams();
  const handoff = useDraftHandoff("assistant");
  const [focusIds, setFocusIds] = useState<string[] | null>(null);

  const people = useMemo(() => (graph?.districts ?? []).filter((d) => d.kind === "HUMAN"), [graph]);

  // ?p=minh,huy  <->  store (Map's "Thử xem →" and deep links preselect people)
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (!graph || synced) return;
    const wanted = (params.get("p") ?? "").split(",").map((x) => x.trim()).filter((x) => people.some((p) => p.principalId === x)).slice(0, 2);
    if (wanted.length) setSelected(wanted);
    else if (!selected.every((id) => people.some((p) => p.principalId === id)) && people[0]) setSelected([people.find((p) => p.principalId === "minh")?.principalId ?? people[0].principalId]);
    setSynced(true);
  }, [graph, synced, params, people, selected, setSelected]);
  useEffect(() => {
    if (!synced) return;
    const cur = params.get("p");
    const next = selected.join(",");
    if (cur !== next) setParams({ p: next }, { replace: true });
  }, [selected, synced, params, setParams]);
  useEffect(() => { clearHighlight(); setFocusIds(null); }, [selected.join(","), clearHighlight]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => clearHighlight(), [clearHighlight]);

  const compromised = useMemo(() => (synced ? selected.filter((id) => people.some((p) => p.principalId === id)) : []), [synced, selected, people]);
  const { data: sim, isPlaceholderData, isError: simError, isFetching: simFetching } = useSimulate(compromised, undefined, compromised.length > 0);
  const fresh = !!sim && !isPlaceholderData;
  const plan = useMemo(() => (fresh && graph ? buildSpreadPlan(sim, graph, compromised) : null), [fresh, sim, graph?.version, compromised.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const spread = useSpreadAnimation(plan, compromised);

  const treasury = useMemo(() => BigInt(graph?.nodes.find((n) => n.id === "treasury")?.data.balance?.raw ?? "2000000000000"), [graph]);
  const onSuggestion = useCallback((s: { title: string; change: unknown }) => { void handoff.go({ change: s.change as ProposedChange }); }, [handoff]);
  const finding = sim?.findings.find((f) => f.resolvedByProposal == null);
  const pointedAt = useMemo(() => people.filter((p) => highlight.nodeIds.includes(`p:${p.principalId}`) && !compromised.includes(p.principalId)), [people, highlight, compromised]);
  // camera frames only the districts the spread can touch (people + the owners of keys they declare control over)
  const involved = useMemo(() => {
    if (!graph || !compromised.length) return null;
    const ids = new Set<string>(compromised.map((p) => `p:${p}`));
    const owner = new Map<string, string>();
    for (const d of graph.districts) for (const k of d.keys) owner.set(`k:${k}`, d.principalId);
    for (const e of graph.edges) if (compromised.some((p) => e.from === `p:${p}`) && owner.has(e.to)) ids.add(`p:${owner.get(e.to)}`);
    return [...ids];
  }, [graph, compromised]);
  const originLabels = compromised.map((id) => graph?.districts.find((d) => d.principalId === id)?.label ?? id);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= people.length) toggle(people[n - 1].principalId);
      else if (e.key === "r" || e.key === "R") spread.replay();
      else if (e.key === "Escape") { clearHighlight(); setFocusIds(null); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [people, toggle, spread, clearHighlight]);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-4 max-[1180px]:grid-cols-1">
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex min-h-[640px] flex-col gap-3" style={{ height: "calc(100vh - var(--chrome-h) - 3rem)" }}>
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-[26px] font-bold leading-tight tracking-tight text-text">Giả lập</h1>
              <span className="rounded-md border border-line px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-faint">Simulate</span>
            </div>
            <p className="mt-1 text-[13.5px] text-muted [@media(max-height:820px)]:hidden">Nếu một người bị chiếm quyền, mỗi ngày kẻ xấu rút được tối đa bao nhiêu?</p>
          </div>
          <div className="flex items-center gap-3">
            {graph ? <PrincipalPicker people={people} selected={compromised} onToggle={toggle} /> : null}
            <Button variant="secondary" size="md" icon={<RotateCcw className="size-4" />} onClick={spread.replay} disabled={!plan}>Phát lại <Kbd>R</Kbd></Button>
          </div>
        </header>

        <ExposureCounters totals={fresh ? sim.totals : sim?.totals} counter={spread.counter} treasury={treasury} running={spread.running} done={spread.done} action={spread.done && finding ? <CreateProposalButton finding={finding} /> : undefined} loading={isLoading || (!sim && !simError)} />

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-[var(--radius-xl)] border border-line bg-[#080c24]/60 shadow-[var(--shadow-card)]">
          {isLoading ? <GraphSkeleton /> : null}
          {isError && !graph ? (
            <div className="absolute inset-0 grid place-items-center"><EmptyState icon={<AlertTriangle className="size-6 text-bad" />} title="Không kết nối được chain (RPC)" description="Chưa lấy được bản đồ quyền để giả lập." action={<Button variant="primary" icon={<RefreshCw className="size-4" />} loading={isFetching} onClick={() => refetch()}>Thử lại</Button>} /></div>
          ) : null}
          {graph ? (
            <GraphCanvas
              snapshot={graph} mode="simulate" redNodes={spread.redNodes} redEdges={spread.redEdges} origins={spread.origins} dimUnreached highlight={highlight}
              focusIds={focusIds} fitIds={involved} insetBottom={24} insetTop={48} onSelect={(id) => setFocusIds(id && id.startsWith("p:") ? [id] : null)}
            />
          ) : null}

          {graph ? (
            <>
              <div className="pointer-events-none absolute left-3 top-3 z-20 flex flex-col items-start gap-2">
                <motion.div layout className={cn("glass pointer-events-auto flex items-center gap-3 rounded-xl px-3.5 py-2 text-[13px]", spread.done && "border-bad/45")} role="status" aria-live="polite">
                  <span className={cn("grid size-6 place-items-center rounded-full text-[12px] font-bold", spread.done ? "bg-bad text-[#2b0710]" : "bg-white/10 text-muted")} aria-hidden>{spread.done ? "✕" : "…"}</span>
                  <span className="leading-tight">
                    <b className="block text-text">{originLabels.join(" + ")} bị chiếm</b>
                    <span className="text-muted tnum">{spread.stepsDone === 0 ? "Chuẩn bị lan…" : <><b className="text-bad">{spread.keysReached}</b>/{spread.keysTotal} thẻ bị lộ{plan ? ` · ${plan.onchainCount} trên chain, ${plan.declaredCount} tự khai` : ""}</>}</span>
                  </span>
                </motion.div>
                <AnimatePresence>
                  {pointedAt.length > 0 ? (
                    <motion.div key="pointed" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-warn/55 bg-[#33280c]/90 py-1.5 pl-3 pr-1.5 text-[12.5px] text-warn backdrop-blur">
                      <span><b aria-hidden>▲</b> Trợ lý đang chỉ vào <b>{pointedAt.map((p) => p.label).join(", ")}</b></span>
                      <Button size="sm" variant="secondary" onClick={() => toggle(pointedAt[0].principalId)}>Thêm vào giả lập</Button>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </div>
              <div className="pointer-events-none absolute right-[124px] top-3 z-20 max-[1400px]:hidden"><Legend mode="simulate" className="pointer-events-auto" /></div>
            </>
          ) : null}
          {simError ? <div role="alert" className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full border border-bad/50 bg-[#2a1020]/95 px-4 py-2 text-[13px] text-bad"><b aria-hidden>✕</b> Chưa giả lập được lúc này{simFetching ? ", đang thử lại…" : ""}</div> : null}
        </div>
        </div>

        {fresh && graph ? <BreakdownTable rows={sim.perDistrict} totals={sim.totals} districts={graph.districts} ready={spread.done} onFocus={(pid) => { setFocusIds([`p:${pid}`]); window.scrollTo({ top: 0, behavior: "smooth" }); }} /> : null}
        <p className="pb-2 text-[12px] text-faint">Mẹo: phím <Kbd>1</Kbd> <Kbd>2</Kbd> <Kbd>3</Kbd> chọn người, <Kbd>R</Kbd> phát lại. {focusIds ? <button type="button" className="underline" onClick={() => setFocusIds(null)}>Xem lại toàn cảnh</button> : null}</p>
      </div>

      <aside data-tour="sim-assistant" className="sticky top-[124px] h-[calc(100vh-172px)] min-h-[520px] max-[1180px]:static max-[1180px]:h-[560px]">
        <AssistantPanel screen="simulate" questionIds={QUESTIONS} context={{ principalIds: compromised }} onHighlight={setHighlight} onSuggestion={onSuggestion} />
      </aside>
    </div>
  );
}
