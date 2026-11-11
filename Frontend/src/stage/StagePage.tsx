// The new main experience: the 3D city is the UI. One persistent CityLayer; scenes only swap overlays and camera shots.
// Routes: "/" (intro) and "/s/:scene" (look | try | fix | incident | request). ←/→ change scene, Space = next recommended action.
import { useCallback, useEffect, useMemo } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useDemoReset } from "../hooks/useDemoReset";
import { useGraph } from "../hooks/useGraph";
import { useStreamBridge } from "../hooks/useStream";
import { useUiStore } from "../store/uiStore";
import type { CityStageProps, PickTarget, SceneId } from "./contract";
import { CityLayer } from "./CityLayer";
import { isStageScene, neighborScene, sceneFromPath, scenePath, type StageScene } from "./logic";
import { useStageStore } from "./stageStore";
import { useLoadStore } from "./loadStore";
import { TopBar } from "./TopBar";
import { useStageDevHooks } from "./devHooks";
import { useEnsureScene } from "./useEnsureScene";
import { forgetRequestNumbers, useRememberRequestNumbers } from "./requestMemory";
import { ToyButton, ToyCard } from "./ui";
import { IntroScene } from "./scenes/IntroScene";
import { LookScene } from "./scenes/LookScene";
import { TryScene } from "./scenes/TryScene";
import { FixScene } from "./scenes/FixScene";
import { IncidentScene } from "./scenes/IncidentScene";
import { RequestScene } from "./scenes/RequestScene";
import "./toy.css";

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);

export default function StagePage() {
  useStreamBridge();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const scene = sceneFromPath(pathname);
  const { data: graph } = useGraph();
  const city = useStageStore((s) => s.city);
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
  const night = nightPref ?? autoNight;

  const props: CityStageProps = useMemo(() => ({
    scene: scene ?? "intro", shot: "overview", showDomain: false, graph, night, onPick, ...city,
    // the intro never shows the domain layer, whatever a scene says
    ...(scene === "intro" ? { showDomain: false } : null),
  }), [scene, graph, night, onPick, city]);

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
    <div className="stage fixed inset-0 overflow-hidden bg-[#6f8ff3]" data-scene={scene}>
      <CityLayer {...props} />
      {cardsReady ? <TopBar scene={scene} night={night} onGo={go} onNight={(n) => useStageStore.getState().setNightPref(n)} onReset={onReset} resetting={reset.isPending} /> : null}
      <main className="pointer-events-none absolute inset-0 z-20" id="stage-overlay">
        {cardsReady ? <>
        {(scene === "look" || scene === "try") && (graph?.policyVersion ?? 1) >= 2 && !preparing ? (
          <div className="pointer-events-auto absolute left-1/2 top-[84px] -translate-x-1/2">
            <ToyCard className="flex items-center gap-3 py-2 pl-5 pr-2.5" style={{ borderRadius: 999 }} label="Đang ở chính sách mới">
              <span className="toy-body" style={{ color: "var(--ink)", fontWeight: 700 }}>Đang ở chính sách mới</span>
              <ToyButton size="sm" color="orange" onClick={onReset}>Chơi lại từ đầu?</ToyButton>
            </ToyCard>
          </div>
        ) : null}
        {preparing ? (
          <div className="pointer-events-none absolute inset-x-0 top-[84px] flex justify-center" role="status">
            <ToyCard className="flex items-center gap-3 px-6 py-3" style={{ borderRadius: 999 }} label="Đang chuẩn bị cảnh">
              <span className="toy-wiggle inline-block size-4 rounded-full" style={{ background: "var(--violet)" }} aria-hidden />
              <span className="font-toy text-[19px] font-bold" style={{ color: "var(--ink)" }}>Đang chuẩn bị cảnh…</span>
            </ToyCard>
          </div>
        ) : null}
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
