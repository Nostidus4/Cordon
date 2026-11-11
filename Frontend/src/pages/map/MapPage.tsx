// Scene 1, "Map" (spec §10.2, Epic A). Fixed-layout permission graph with live re-layout when policy changes.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, RefreshCw, Store } from "lucide-react";
import { Button, EmptyState, Kbd, Tooltip, cn } from "../../components/ui";
import { GraphCanvas } from "../../components/graph/GraphCanvas";
import { GraphSkeleton } from "../../components/graph/GraphSkeleton";
import { Legend } from "../../components/graph/Legend";
import { useDraftHandoff } from "../../components/assistant/useDraftHandoff";
import { api } from "../../lib/api";
import { useFindings } from "../../hooks/useFindings";
import { useGraph } from "../../hooks/useGraph";
import { useUiStore } from "../../store/uiStore";
import type { Finding } from "../../types";
import { FindingsMini } from "./FindingsMini";
import { NodeDetailPanel, PANEL_W } from "./NodeDetailPanel";
import { YouThinkBox } from "./YouThinkBox";

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export default function MapPage() {
  const { data: graph, isLoading, isError, error, refetch, isFetching } = useGraph();
  const { data: findings } = useFindings();
  const [params] = useSearchParams();
  const selectedId = useUiStore((s) => s.selectedNodeId);
  const select = useUiStore((s) => s.selectNode);
  const highlight = useUiStore((s) => s.highlight);
  const [showMarket, setShowMarket] = useState(false);
  const handoff = useDraftHandoff("map");
  const [drafting, setDrafting] = useState<string | null>(null);

  // dev-only hook for screenshots / demos: /map?select=k:key_svc_payment  (also `market=1`)
  const applied = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV || applied.current || !graph) return;
    applied.current = true;
    const s = params.get("select"); if (s) select(s);
    if (params.get("market") === "1") setShowMarket(true);
    if (params.get("v2") === "1") setTimeout(() => void api.applyPolicyV2(), 2500); // dev: watch the live policy v1 -> v2 re-layout
  }, [graph, params, select]);
  useEffect(() => () => select(null), [select]);

  const flagged = useMemo(() => new Set((findings ?? []).filter((f) => f.severity === "HIGH" && f.resolvedByProposal == null).map((f) => f.principalId)), [findings]);
  const openFindings = useMemo(() => (findings ?? []).filter((f) => f.resolvedByProposal == null), [findings]);

  // announce a live policy change (graph_updated -> refetch -> new policyVersion)
  const prevPolicy = useRef<number | null>(null);
  const [change, setChange] = useState<{ from: number; to: number } | null>(null);
  useEffect(() => {
    if (!graph) return;
    if (prevPolicy.current !== null && graph.policyVersion !== prevPolicy.current) {
      setChange({ from: prevPolicy.current, to: graph.policyVersion });
      const t = setTimeout(() => setChange(null), 6000);
      prevPolicy.current = graph.policyVersion;
      return () => clearTimeout(t);
    }
    prevPolicy.current = graph.policyVersion;
  }, [graph]);

  const draft = useCallback(async (f: Finding) => {
    setDrafting(f.id);
    try { await handoff.go({ findingId: f.id }); } finally { setDrafting(null); }
  }, [handoff]);

  // camera focus follows the selection: district -> its box and keys, key -> its district, other -> itself
  const focusIds = useMemo(() => {
    if (!graph || !selectedId) return null;
    const dOf = (pid: string) => graph.districts.find((d) => d.principalId === pid);
    const withKeys = (pid: string) => { const d = dOf(pid); return d ? [`p:${pid}`, ...d.keys.map((k) => `k:${k}`)] : []; };
    if (selectedId.startsWith("p:")) return ["vault", ...withKeys(selectedId.slice(2))];
    if (selectedId.startsWith("k:")) {
      const owner = graph.districts.find((x) => x.keys.includes(selectedId.slice(2)));
      // a key controlled only by a declaration: show the declarer too, so the dashed edge is in frame
      const declarers = graph.edges.filter((e) => e.to === selectedId && e.source !== "onchain").map((e) => e.from.replace(/^p:/, ""));
      return ["vault", ...(owner ? withKeys(owner.principalId) : [selectedId]), ...declarers.flatMap(withKeys)];
    }
    return null;
  }, [graph, selectedId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") select(null);
      else if (e.key === "l" || e.key === "L") setShowMarket((v) => !v);
      else if (e.key === "f" || e.key === "F") select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  const panelOpen = !!selectedId && !!graph;
  const target = openFindings.find((f) => f.principalId === "minh")?.principalId ?? (graph?.districts.some((d) => d.principalId === "minh") ? "minh" : graph?.districts.find((d) => d.kind === "HUMAN")?.principalId);

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - var(--chrome-h) - 3rem)", minHeight: 560 }}>
      <header className="mb-3 flex shrink-0 items-end justify-between gap-6">
        <div>
          <div className="flex items-baseline gap-3">
            <h1 className="text-[26px] font-bold leading-tight tracking-tight text-text">Bản đồ quyền</h1>
            <span className="rounded-md border border-line px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-faint">Map</span>
          </div>
          <p className="mt-1 text-[13.5px] text-muted">Ai thật sự điều khiển thẻ nào, và tiền có thể chảy ra đường nào. <span className="text-faint">Bấm vào một khu hoặc một thẻ để xem chi tiết.</span></p>
        </div>
        <Tooltip content="Hiện các nơi nhận tiền, sàn đổi token và loại token được phép">
          <button type="button" role="switch" aria-checked={showMarket} onClick={() => setShowMarket((v) => !v)}
            className={cn("flex items-center gap-2.5 rounded-full border py-1.5 pl-3 pr-2 text-[13px] font-medium transition-colors", showMarket ? "border-brand/60 bg-brand-soft text-text" : "border-line bg-white/4 text-muted hover:text-text")}>
            <Store className="size-4" aria-hidden /> Hiện người nhận &amp; chợ <Kbd>L</Kbd>
            <span aria-hidden className={cn("relative h-5 w-9 rounded-full transition-colors", showMarket ? "bg-brand" : "bg-white/15")}><span className={cn("absolute top-0.5 size-4 rounded-full bg-white transition-all", showMarket ? "left-[18px]" : "left-0.5")} /></span>
          </button>
        </Tooltip>
      </header>

      <div data-tour="map-canvas" className="relative min-h-0 flex-1 overflow-hidden rounded-[var(--radius-xl)] border border-line bg-[#080c24]/60 shadow-[var(--shadow-card)]">
        {isLoading ? <GraphSkeleton /> : null}
        {isError && !graph ? (
          <div className="absolute inset-0 grid place-items-center">
            <EmptyState icon={<AlertTriangle className="size-6 text-bad" />} title="Không kết nối được chain (RPC)" description={(error as Error | null)?.message ?? "Chưa lấy được bản đồ quyền."} action={<Button variant="primary" icon={<RefreshCw className="size-4" />} loading={isFetching} onClick={() => refetch()}>Thử lại</Button>} />
          </div>
        ) : null}
        {graph && graph.districts.length === 0 ? <div className="absolute inset-0 grid place-items-center"><EmptyState title="Chưa có khu nào" description="Chưa có người, trợ lý hay phần mềm nào được đăng ký trên chain." /></div> : null}

        {graph && graph.districts.length > 0 ? (
          <GraphCanvas
            snapshot={graph} mode="map" showMarket={showMarket} selectedId={selectedId} onSelect={select} highlight={highlight} flagged={flagged}
            focusIds={focusIds} insetRight={panelOpen ? PANEL_W + 24 : 0} insetBottom={78} insetTop={34} controlsClassName={panelOpen ? "!right-[408px]" : undefined}
          />
        ) : null}

        {graph && graph.districts.length > 0 ? (
          <>
            <div className="pointer-events-none absolute inset-x-3 top-3 z-20 flex items-start justify-between">
              <div className="pointer-events-auto"><FindingsMini collapsed={panelOpen} findings={findings ?? []} drafting={drafting} onDraft={draft} onFocus={(f) => select(`p:${f.principalId}`)} /></div>
            </div>
            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 flex items-end justify-between gap-3">
              <Legend className="pointer-events-auto ml-[148px]" />
              {target ? <div data-tour="map-you-think" className={cn("pointer-events-auto transition-[margin] duration-300", panelOpen && "mr-[396px]")}><YouThinkBox snapshot={graph} principalId={target} fixed={openFindings.length === 0 && !!graph.districts.find((d) => d.principalId === target)?.dailyCap} /></div> : null}
            </div>
          </>
        ) : null}

        <AnimatePresence>
          {isError && graph ? (
            <motion.div key="rpc" initial={{ y: -20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -20, opacity: 0 }} role="alert" className="absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-bad/50 bg-[#2a1020]/95 py-1.5 pl-4 pr-1.5 text-[13px] text-bad shadow-[var(--shadow-pop)]">
              <span><b aria-hidden>✕</b> Mất kết nối RPC, đang hiện dữ liệu cũ</span>
              <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" />} loading={isFetching} onClick={() => refetch()}>Thử lại</Button>
            </motion.div>
          ) : change ? (
            <motion.div key="chg" initial={{ y: -20, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0 }} role="status" className="absolute left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-2.5 rounded-full border border-ok/50 bg-[#062a22]/95 px-4 py-2 text-[13px] font-semibold text-ok shadow-[var(--shadow-glow-ok)]">
              <span aria-hidden>✓</span> Chính sách đã đổi: v{change.from} → v{change.to}. Bản đồ được vẽ lại.
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {panelOpen && selectedId ? (
            <NodeDetailPanel key="panel" id={selectedId} snapshot={graph!} findings={findings ?? []} onSelect={select} onClose={() => select(null)} onDraft={draft} drafting={drafting !== null} />
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
