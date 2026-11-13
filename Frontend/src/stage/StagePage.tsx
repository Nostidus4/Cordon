// The new main experience: the 3D city is the UI. One persistent CityLayer; scenes only swap overlays and camera shots.
// Routes: "/" (intro) and "/s/:scene" (look | try | fix | incident | request). ←/→ change scene, Space = next recommended action.
import { useCallback, useEffect, useMemo } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useStageAudio } from "../audio/director";
import { sfx } from "../audio/sounds";
import { useTitle } from "../hooks/useTitle";
import { useDemoReset } from "../hooks/useDemoReset";
import { useCityStates } from "../hooks/useCityStates";
import { useGraph } from "../hooks/useGraph";
import { useIncidents } from "../hooks/useBuildings";
import { buildingStatesFrom, pickTrackedIncident } from "../lib/ops";
import { useStreamBridge } from "../hooks/useStream";
import { useUiStore } from "../store/uiStore";
import type { CityStageProps, PickTarget, SceneId } from "./contract";
import { CityLayer } from "./CityLayer";
import { isStageScene, neighborScene, SCENE_META, sceneFromPath, scenePath, type StageScene } from "./logic";
import { useStageStore } from "./stageStore";
import { useLoadStore } from "./loadStore";
import { TopBar } from "./TopBar";
import { useStageDevHooks } from "./devHooks";
import { useEnsureScene } from "./useEnsureScene";
import { forgetRequestNumbers, useRememberRequestNumbers } from "./requestMemory";
import { ToyCard } from "./ui";
import { BuildingDrawer } from "./BuildingDrawer";
import { StatusStrip } from "./StatusStrip";
import { IntroScene } from "./scenes/IntroScene";
import { LookScene } from "./scenes/LookScene";
import { TryScene } from "./scenes/TryScene";
import { FixScene } from "./scenes/FixScene";
import { IncidentScene } from "./scenes/IncidentScene";
import { RequestScene } from "./scenes/RequestScene";
import "./toy.css";
import { policyLabel } from "../lib/policy";

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

export default function StagePage() {
  useStreamBridge();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const scene = sceneFromPath(pathname);
  useTitle(scene && scene !== "intro" && `${SCENE_META[scene].short} ${SCENE_META[scene].label}`);
  const { data: graph } = useGraph();
  const city = useStageStore((s) => s.city);
  const picked = useStageStore((s) => s.picked);
  const shotOverride = useStageStore((s) => s.shotOverride);
  const { data: cityStates } = useCityStates();
  const liveStates = useMemo(() => buildingStatesFrom(cityStates), [cityStates]);
  const { data: openIncidents } = useIncidents("open");
  const hasIncident = !!pickTrackedIncident(openIncidents);
  const drawerOpen = picked?.type === "building";
  const nightPref = useStageStore((s) => s.nightPref);
  const autoNight = useStageStore((s) => s.autoNight);
  const cardsReady = useLoadStore((s) => s.assembled); // stepper + overlay cards pop in once the city has assembled (or 3D is off)
  const reset = useDemoReset();
  useStageDevHooks();
  useRememberRequestNumbers();
  const { preparing } = useEnsureScene(scene);
  useEffect(() => { useStageStore.getState().setPreparing(preparing); }, [preparing]);

  const go = useCallback((s: SceneId) => navigate(scenePath(s)), [navigate]);

  useEffect(() => {
    if (scene && scene !== "intro") useStageStore.getState().markReached(scene as StageScene);
    useStageStore.getState().setPicked(null);
    useStageStore.getState().setShotOverride(null);
    useStageStore.getState().setEnded(false);
    useStageStore.getState().setAutoNight(false);
  }, [scene]);

  // keyboard: ←/→ scenes, Space = next recommended action
  useEffect(() => {
    if (!scene) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); go(neighborScene(scene, 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(neighborScene(scene, -1)); }
      else if (e.key === " " && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof HTMLAnchorElement)) {
        const p = useStageStore.getState().primary;
        if (p) { e.preventDefault(); p(); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scene, go]);

  const onPick = useCallback((t: PickTarget) => useStageStore.getState().setPicked(t), []);
  const onHover = useCallback((t: PickTarget | null) => { if (t) sfx.tick(); }, []);
  const night = nightPref ?? autoNight;
  useStageAudio(scene ?? "intro", night);

  const props: CityStageProps = useMemo(() => ({
    scene: scene ?? "intro", shot: "overview", showDomain: false, graph, night, onPick, onHover, ...city,
    // live building colours on every scene; a scene that passes its own buildingStates wins
    buildingStates: city.buildingStates ?? liveStates,
    ...(shotOverride ? { shot: shotOverride } : null),
    // the intro never shows the domain layer, whatever a scene says
    ...(scene === "intro" ? { showDomain: false } : null),
  }), [scene, graph, night, onPick, onHover, city, liveStates, shotOverride]);

  const onReset = () => reset.mutate(undefined, {
    onSuccess: () => {
      useUiStore.getState().setSelectedPrincipals(["minh"]);
      useUiStore.getState().clearHighlight();
      useUiStore.getState().setMode("live");
      useUiStore.getState().setReplayRunId(null);
      forgetRequestNumbers();
      useStageStore.getState().clearReached();
      useStageStore.getState().setNightPref(null);
      go("intro");
    },
  });

  if (!scene) return <Navigate to="/" replace />;
  return (
    <div className="stage fixed inset-0 overflow-hidden bg-[#6f8ff3]" data-scene={scene} data-drawer={drawerOpen ? "open" : undefined} data-strip={hasIncident || preparing || ((scene === "look" || scene === "try") && (policyLabel(graph) ?? 1) >= 2) ? "on" : undefined}>
      <CityLayer {...props} />
      {cardsReady ? <TopBar scene={scene} night={night} onGo={go} onNight={(n) => useStageStore.getState().setNightPref(n)} onReset={onReset} resetting={reset.isPending} /> : null}
      <main className="pointer-events-none absolute inset-0 z-20" id="stage-overlay">
        {cardsReady ? <>
        {preparing ? (
          <div className="stage-strip" data-slot="status-strip" role="status">
            <ToyCard className="flex h-full items-center justify-center gap-3 px-6 py-0" style={{ borderRadius: 999 }} label="Đang chuẩn bị cảnh">
              <span className="toy-wiggle inline-block size-4 rounded-full" style={{ background: "var(--violet)" }} aria-hidden />
              <span className="font-toy text-[19px] font-bold" style={{ color: "var(--ink)" }}>Đang chuẩn bị cảnh…</span>
            </ToyCard>
          </div>
        ) : <StatusStrip policyNew={(scene === "look" || scene === "try") && (policyLabel(graph) ?? 1) >= 2} onReset={onReset} drawerOpen={drawerOpen} />}
        {drawerOpen && picked?.type === "building" ? <BuildingDrawer code={picked.code} /> : null}
        {scene === "intro" ? <IntroScene key="intro" /> : null}
        {scene === "look" ? <LookScene key="look" /> : null}
        {scene === "try" ? <TryScene key="try" /> : null}
        {scene === "fix" ? <FixScene key="fix" /> : null}
        {scene === "incident" ? <IncidentScene key="incident" /> : null}
        {scene === "request" ? <RequestScene key="request" /> : null}
        </> : null}
      </main>
      <p className="pointer-events-none absolute bottom-1.5 right-3 z-10 text-[11px] font-semibold" style={{ color: "#fff", textShadow: "0 1px 3px rgba(30,20,80,.8)" }}>
        Mây Labs là giả định · chạy trên mạng thử nghiệm · tiền thử, không có giá trị
      </p>
    </div>
  );
}

export { isStageScene };
